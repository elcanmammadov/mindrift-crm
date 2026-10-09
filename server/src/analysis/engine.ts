import type { Blocker, Finding, Evidence, ResolutionCriterion } from '@prisma/client';
import { prisma } from '../db.js';
import { CASE_ANALYSIS_MODULES, type ModuleId, type ResultOrigin } from '../domain/enums.js';
import { audit, type Actor } from '../lib/audit.js';
import { parseJson, toJson } from '../lib/json.js';
import { sha256 } from '../lib/text.js';
import { AiError, getProvider, type AiProvider } from '../ai/provider.js';
import { buildCaseContext, renderContext, type CaseContext } from './context.js';
import { isSameFinding, processModuleOutput, type ProcessedFinding, type RunNote } from './evidence.js';
import { MODULE_TASKS, PROMPT_VERSION, SYSTEM_PROMPT, repairPrompt } from './prompts.js';
import { ModuleOut } from './schemas.js';
import { bridgeRules, computeReplyGaps, loopRules, onevoiceRules, proofcloseRules, unblockRules, whylostRules } from './rules.js';

export type EngineModule = Exclude<ModuleId, 'RELAY' | 'EXITLENS'>;

export interface ModuleRunResult {
  module: EngineModule;
  status: 'SUCCEEDED' | 'UNCHANGED' | 'FAILED';
  runId?: string;
  origin?: ResultOrigin;
  error?: { code: string; message: string; retryable: boolean };
  stats?: { created: number; updated: number; kept: number; stale: number };
}

interface ModuleInputs {
  ctx: CaseContext;
  openBlockers: { alias: string; blocker: Blocker }[];
  criteria: { alias: string; c: ResolutionCriterion }[];
  extraPrompt: string;
  extraHash: unknown;
  loss?: { agentReason: string; agentNote: string | null };
}

async function loadInputs(caseId: string, module: EngineModule): Promise<ModuleInputs> {
  const ctx = await buildCaseContext(caseId, module);
  const blockers = await prisma.blocker.findMany({ where: { caseId, status: { not: 'RESOLVED' } }, orderBy: { createdAt: 'asc' } });
  const openBlockers = blockers.map((blocker, i) => ({ alias: `B${i + 1}`, blocker }));
  const crit = await prisma.resolutionCriterion.findMany({ where: { caseId }, orderBy: { createdAt: 'asc' } });
  const criteria = crit.map((c, i) => ({ alias: `K${i + 1}`, c }));
  let extraPrompt = '';
  let extraHash: unknown = null;
  let loss: ModuleInputs['loss'];

  if (module === 'UNBLOCK') {
    extraPrompt = `<open_blockers>\n${openBlockers.map((b) => `${b.alias}: [${b.blocker.category}] ${b.blocker.title} (status ${b.blocker.status})`).join('\n') || '(none)'}\n</open_blockers>`;
    extraHash = openBlockers.map((b) => [b.blocker.id, b.blocker.status, b.blocker.title]);
  }
  if (module === 'PROOFCLOSE') {
    const confirmations = await prisma.customerConfirmation.findMany({ where: { caseId }, orderBy: { createdAt: 'asc' } });
    extraPrompt =
      `<criteria>\n${criteria.map((k) => `${k.alias}: ${k.c.description} | required evidence: ${k.c.evidenceRequired} | customer confirmation required: ${k.c.requiresCustomerConfirmation ? 'yes' : 'no'} | status recorded by staff: ${k.c.status}${k.c.evidenceNote ? ` | staff note: ${k.c.evidenceNote}` : ''}`).join('\n') || '(none)'}\n</criteria>\n` +
      `<confirmations>\n${confirmations.map((c) => `${c.createdAt.toISOString().slice(0, 16)} customer answered ${c.outcome}${c.note ? `: ${c.note}` : ''}`).join('\n') || '(none)'}\n</confirmations>`;
    extraHash = [criteria.map((k) => [k.c.id, k.c.description, k.c.status, k.c.requiresCustomerConfirmation, k.c.evidenceNote]), confirmations.map((c) => c.id)];
  }
  if (module === 'WHYLOST') {
    const la = await prisma.lossAnalysis.findUnique({ where: { caseId } });
    if (!la) throw new AiError('API_ERROR', 'Loss reason must be recorded first', false);
    loss = { agentReason: la.agentReason, agentNote: la.agentNote };
    const gaps = computeReplyGaps(ctx.sources.map((s) => s.source));
    const alias = (id: string) => ctx.sources.find((s) => s.source.id === id)?.alias ?? '?';
    extraPrompt =
      `<loss_reason>Employee selected: ${la.agentReason}${la.agentNote ? `; note: ${la.agentNote}` : ''}</loss_reason>\n` +
      `<timeline_facts>\n${gaps.map((g) => `Customer message ${alias(g.customerSource.id)} answered ${g.companySource ? `by ${alias(g.companySource.id)} after ${g.hours} hours` : `never (${g.hours} hours so far)`}`).join('\n')}\n` +
      `Open blockers: ${openBlockers.map((b) => `${b.blocker.title} [${b.blocker.category}]`).join('; ') || 'none'}\n</timeline_facts>`;
    extraHash = [la.agentReason, la.agentNote, openBlockers.map((b) => b.blocker.id)];
  }
  return { ctx, openBlockers, criteria, extraPrompt, extraHash, loss };
}

export function computeInputHash(module: EngineModule, inputs: ModuleInputs) {
  const c = inputs.ctx.caseRow;
  return sha256(
    JSON.stringify({ v: PROMPT_VERSION, module, snapshot: inputs.ctx.snapshot, extra: inputs.extraHash, req: [c.initialRequest, c.coreNeed] }),
  );
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1]! : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object found');
  return JSON.parse(body.slice(start, end + 1));
}

async function callModel(provider: AiProvider, user: string): Promise<ModuleOut> {
  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = attempt === 0 ? user : `${user}\n\n${repairPrompt(lastError)}`;
    const text = await provider.completeJson({ system: SYSTEM_PROMPT, user: prompt });
    try {
      const parsed = ModuleOut.safeParse(extractJson(text));
      if (parsed.success) return parsed.data;
      lastError = `schema validation failed: ${parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`;
    } catch (e) {
      lastError = `invalid JSON (${(e as Error).message})`;
    }
  }
  throw new AiError('INVALID_JSON', `The AI response could not be validated: ${lastError}`);
}

function existingBlock(existing: Finding[]) {
  const rows = existing.filter((f) => !f.stale).map((f) => `${f.id} | ${f.kind} | ${f.title} | decision: ${f.reviewStatus}`);
  return `<existing_findings>\n${rows.join('\n') || '(none)'}\n</existing_findings>`;
}

function produceWithRules(module: EngineModule, inputs: ModuleInputs, confirmations: Parameters<typeof proofcloseRules>[1]): ModuleOut {
  switch (module) {
    case 'BRIDGE':
      return bridgeRules(inputs.ctx);
    case 'ONEVOICE':
      return onevoiceRules(inputs.ctx);
    case 'UNBLOCK':
      return unblockRules(inputs.ctx, inputs.openBlockers);
    case 'LOOP':
      return loopRules(inputs.ctx);
    case 'PROOFCLOSE':
      return proofcloseRules(inputs.criteria, confirmations);
    case 'WHYLOST':
      return whylostRules(inputs.ctx, inputs.loss!, inputs.openBlockers.map((b) => b.blocker));
  }
}

type FindingWithEvidence = Finding & { evidence: Evidence[] };

/** How much a result source is trusted when merging re-analysis results. */
const ORIGIN_RANK: Record<ResultOrigin, number> = { RULES: 1, DEMO_PREPARED: 2, REAL_AI: 3, MOCK: 3 };

function findMatch(pf: ProcessedFinding, existing: FindingWithEvidence[], used: Set<string>, module: EngineModule) {
  const free = existing.filter((e) => !used.has(e.id) && e.kind === pf.kind);
  if (pf.existingFindingId) {
    const byId = free.find((e) => e.id === pf.existingFindingId);
    if (byId) return byId;
  }
  const byFp = existing.find((e) => !used.has(e.id) && e.fingerprint === pf.fingerprint);
  if (byFp) return byFp;
  if (module === 'PROOFCLOSE') return undefined;
  if (module === 'LOOP') return free.find((e) => parseJson<Record<string, unknown>>(e.data, {}).relatedCaseId === pf.data.relatedCaseId);
  if (pf.kind === 'BLOCKER_RESOLUTION')
    return free.find((e) => parseJson<Record<string, unknown>>(e.data, {}).blockerId === pf.data.blockerId);
  return free.find((e) => isSameFinding(pf, e));
}

/**
 * Runs one module for a case: gathers inputs, skips if nothing changed since the
 * last successful run, produces results (real AI, prepared demo result, or rules),
 * verifies evidence, and merges results into stored findings without duplicating
 * them or overwriting human decisions.
 */
export async function runModule(
  caseId: string,
  module: EngineModule,
  actor: Actor,
  opts: { force?: boolean; prepared?: unknown } = {},
): Promise<ModuleRunResult> {
  let inputs: ModuleInputs;
  try {
    inputs = await loadInputs(caseId, module);
  } catch (e) {
    if (e instanceof AiError) return { module, status: 'FAILED', error: { code: 'PRECONDITION', message: e.message, retryable: false } };
    throw e;
  }
  const inputHash = computeInputHash(module, inputs);
  const provider = opts.prepared ? null : await getProvider();
  const origin: ResultOrigin = opts.prepared ? 'DEMO_PREPARED' : provider ? provider.origin : 'RULES';

  const last = await prisma.analysisRun.findFirst({
    where: { caseId, status: 'SUCCEEDED', modules: toJson([module]) },
    orderBy: { startedAt: 'desc' },
  });
  const sameKind = last && (last.mode === origin || (origin === 'RULES' && last.mode === 'DEMO_PREPARED'));
  if (!opts.force && !opts.prepared && last && sameKind && last.inputHash === inputHash) {
    return { module, status: 'UNCHANGED', runId: last.id, origin: last.mode as ResultOrigin };
  }

  const run = await prisma.analysisRun.create({
    data: {
      caseId,
      modules: toJson([module]),
      mode: origin,
      model: provider?.model ?? null,
      status: 'RUNNING',
      inputHash,
      sourceSnapshot: toJson(inputs.ctx.snapshot),
      truncated: inputs.ctx.truncated,
      triggeredById: actor.type === 'USER' ? actor.id : null,
    },
  });

  const existing = await prisma.finding.findMany({ where: { caseId, module }, include: { evidence: true } });

  try {
    let out: ModuleOut;
    if (opts.prepared) out = ModuleOut.parse(opts.prepared);
    else if (provider) {
      const user = `${MODULE_TASKS[module]}\n\n${existingBlock(existing)}\n${inputs.extraPrompt}\n\n${renderContext(inputs.ctx)}`;
      out = await callModel(provider, user);
    } else {
      const confirmations = module === 'PROOFCLOSE' ? await prisma.customerConfirmation.findMany({ where: { caseId } }) : [];
      out = produceWithRules(module, inputs, confirmations);
    }

    const blockerLookup = new Map<string, string>();
    for (const b of inputs.openBlockers) {
      blockerLookup.set(b.alias, b.blocker.id);
      blockerLookup.set(b.blocker.id, b.blocker.id);
    }
    const criterionLookup = new Map<string, string>();
    for (const k of inputs.criteria) {
      criterionLookup.set(k.alias, k.c.id);
      criterionLookup.set(k.c.id, k.c.id);
    }
    const { findings, notes } = processModuleOutput(module, out, {
      sourceLookup: inputs.ctx.sourceLookup,
      caseLookup: inputs.ctx.caseLookup,
      blockerLookup,
      criterionLookup,
      fingerprintSalt: inputHash.slice(0, 16),
    });

    const allNotes: RunNote[] = [...notes];
    if (origin === 'RULES')
      allNotes.unshift({
        level: 'warning',
        code: 'RULES_MODE',
        text: 'Demo rejimi: bu nəticələr real AI deyil, məhdud qayda əsaslı analizdir.',
        textEn: 'Demo mode: these results are a limited rule-based analysis, not real AI.',
      });
    if (origin === 'DEMO_PREPARED')
      allNotes.unshift({
        level: 'warning',
        code: 'DEMO_PREPARED',
        text: 'Demo ssenarisi üçün əvvəlcədən hazırlanmış nəticələr (real model analizi deyil). Sitatlar mənbələrdə yoxlanılıb.',
        textEn: 'Prepared results for the demo scenario (not a live model analysis). Quotes were verified against the sources.',
      });
    if (inputs.ctx.truncated)
      allNotes.push({
        level: 'warning',
        code: 'TRUNCATED',
        text: `Giriş limiti səbəbindən bəzi mənbə fraqmentləri analiz edilmədi: ${inputs.ctx.omitted.map((o) => `${o.title} (${o.chunks} fraqment)`).join(', ')}.`,
        textEn: `Some source fragments were not analysed because of the input limit: ${inputs.ctx.omitted.map((o) => `${o.title} (${o.chunks} fragments)`).join(', ')}.`,
      });
    for (const m of out.missingInformation) allNotes.push({ level: 'info', code: 'MISSING_INFO', text: m });

    const stats = { created: 0, updated: 0, kept: 0, stale: 0 };
    await prisma.$transaction(async (tx) => {
      const used = new Set<string>();
      for (const pf of findings) {
        const match = findMatch(pf, existing, used, module);
        if (match) {
          used.add(match.id);
          // Human decisions are never overwritten, and a weaker engine (rules) never rewrites
          // results produced by a stronger one (real AI / prepared demo result).
          if (match.reviewStatus === 'PENDING' && ORIGIN_RANK[origin] >= ORIGIN_RANK[match.origin as ResultOrigin]) {
            await tx.evidence.deleteMany({ where: { findingId: match.id } });
            await tx.finding.update({
              where: { id: match.id },
              data: {
                runId: run.id,
                title: pf.title,
                explanation: pf.explanation,
                epistemic: pf.epistemic,
                strength: pf.strength,
                suggestedAction: pf.suggestedAction,
                data: toJson(pf.data),
                translations: toJson(pf.translations),
                origin,
                stale: false,
                evidence: { create: pf.evidence },
              },
            });
            stats.updated++;
          } else {
            // Keep the decision and wording, only mark the result as still current.
            await tx.finding.update({ where: { id: match.id }, data: { runId: run.id, stale: false } });
            stats.kept++;
          }
          continue;
        }
        const dup = await tx.finding.findUnique({ where: { caseId_fingerprint: { caseId, fingerprint: pf.fingerprint } } });
        if (dup) continue; // duplicate inside the same output
        await tx.finding.create({
          data: {
            caseId,
            runId: run.id,
            module,
            kind: pf.kind,
            fingerprint: pf.fingerprint,
            title: pf.title,
            explanation: pf.explanation,
            epistemic: pf.epistemic,
            strength: pf.strength,
            suggestedAction: pf.suggestedAction,
            origin,
            data: toJson(pf.data),
            translations: toJson(pf.translations),
            evidence: { create: pf.evidence },
          },
        });
        stats.created++;
      }
      // Results not reproduced by this run become "outdated" — but the limited rule engine only
      // outdates its own earlier results; its silence says nothing about AI / prepared results.
      // (Source changes are surfaced separately: case banner + per-evidence "source changed".)
      const staleIds = existing
        .filter((e) => !used.has(e.id) && !e.stale)
        .filter((e) => module === 'PROOFCLOSE' || ORIGIN_RANK[origin] >= ORIGIN_RANK[e.origin as ResultOrigin])
        .map((e) => e.id);
      if (staleIds.length) {
        await tx.finding.updateMany({ where: { id: { in: staleIds } }, data: { stale: true } });
        stats.stale = staleIds.length;
      }
      await tx.analysisRun.update({
        where: { id: run.id },
        data: { status: 'SUCCEEDED', finishedAt: new Date(), notes: toJson(allNotes), stats: toJson(stats) },
      });
    });

    await audit({ type: 'AI', name: origin }, 'ANALYSIS_RUN', { caseId, details: { module, runId: run.id, origin, stats, requestedBy: actor.name } });
    return { module, status: 'SUCCEEDED', runId: run.id, origin, stats };
  } catch (e) {
    const err =
      e instanceof AiError
        ? { code: e.code, message: e.message, retryable: e.retryable }
        : { code: 'INTERNAL', message: (e as Error).message ?? 'Unknown error', retryable: true };
    await prisma.analysisRun.update({ where: { id: run.id }, data: { status: 'FAILED', finishedAt: new Date(), error: toJson(err) } });
    return { module, status: 'FAILED', runId: run.id, origin, error: err };
  }
}

/** The "Analyze with AI" button: runs the case-level modules and records which source revision was analysed. */
export async function analyzeCase(caseId: string, actor: Actor, opts: { force?: boolean; modules?: EngineModule[] } = {}) {
  const c = await prisma.customerCase.findUniqueOrThrow({ where: { id: caseId } });
  const modules = opts.modules ?? [...CASE_ANALYSIS_MODULES];
  const results: ModuleRunResult[] = [];
  // Sequential on purpose: keeps API usage predictable and SQLite writes simple.
  for (const m of modules) results.push(await runModule(caseId, m, actor, { force: opts.force }));
  if (results.every((r) => r.status !== 'FAILED') && modules.length === CASE_ANALYSIS_MODULES.length) {
    await prisma.customerCase.update({ where: { id: caseId }, data: { analyzedRevision: c.sourcesRevision } });
  }
  return results;
}
