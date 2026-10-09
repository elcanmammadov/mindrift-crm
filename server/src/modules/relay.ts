import type { Source } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { getProvider } from '../ai/provider.js';
import { SYSTEM_PROMPT } from '../analysis/prompts.js';
import { buildCaseContext, renderContext } from '../analysis/context.js';
import { verifyEvidence } from '../analysis/evidence.js';
import { HandoverPackageSchema, type HandoverPackage } from '../analysis/schemas.js';
import { keyTokens, overlapRatio, sentences } from '../lib/text.js';
import { parseJson } from '../lib/json.js';
import type { ResultOrigin } from '../domain/enums.js';

const fmt = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '');

export interface AnsweredQuestion {
  question: string;
  answer: string;
  sourceId: string;
  quote: string;
}

/** Company questions that a later customer message already answered (rule-based). */
export function extractAnsweredQuestions(sources: Source[]): AnsweredQuestion[] {
  const sorted = [...sources].sort((a, b) => +a.occurredAt - +b.occurredAt);
  const out: AnsweredQuestion[] = [];
  for (const [i, s] of sorted.entries()) {
    if (s.authorSide !== 'COMPANY') continue;
    for (const q of sentences(s.content).filter((x) => x.text.endsWith('?'))) {
      const qt = keyTokens(q.text);
      if (qt.size < 2) continue;
      const replies = sorted.slice(i + 1).filter((x) => x.authorSide === 'CUSTOMER').slice(0, 2);
      let best: { score: number; src: Source; text: string } | null = null;
      for (const r of replies)
        for (const a of sentences(r.content)) {
          if (a.text.endsWith('?')) continue;
          const score = overlapRatio(qt, keyTokens(a.text));
          if (score >= 0.3 && (!best || score > best.score)) best = { score, src: r, text: a.text };
        }
      if (best) out.push({ question: q.text, answer: best.text, sourceId: best.src.id, quote: best.text });
    }
  }
  return out;
}

const AiHandoverOut = z.object({
  customerGoal: z.string(),
  currentState: z.string(),
  doNotAsk: z.array(z.object({ question: z.string(), answer: z.string(), sourceRef: z.string(), quote: z.string() })).default([]),
  notes: z.array(z.string()).default([]),
});

const HANDOVER_TASK = `TASK: Prepare a handover summary for the employee who takes over this case ("Təhvil").
Return ONE JSON object (not the findings schema): {"customerGoal": string, "currentState": string, "doNotAsk": [{"question": string, "answer": string, "sourceRef": "S1", "quote": string}], "notes": [string]}
- customerGoal: what the customer is trying to achieve (Azerbaijani, 1-2 sentences).
- currentState: where the case stands now (Azerbaijani, 2-3 sentences).
- doNotAsk: questions the customer has ALREADY answered, so the new employee must not ask again. quote = exact text of the customer's answer from the source.
- notes: anything missing or uncertain.`;

/** Builds the editable handover package from stored case data, enriched by AI in real mode. */
export async function buildHandoverPackage(caseId: string): Promise<{ pkg: HandoverPackage; origin: ResultOrigin; model: string | null }> {
  const c = await prisma.customerCase.findUniqueOrThrow({ where: { id: caseId }, include: { customer: true } });
  const [sources, commitments, blockers, contradictions, tasks, coreProblem] = await Promise.all([
    prisma.source.findMany({ where: { caseId, deletedAt: null }, orderBy: { occurredAt: 'asc' } }),
    prisma.commitment.findMany({ where: { caseId, status: 'ACTIVE' } }),
    prisma.blocker.findMany({ where: { caseId, status: { not: 'RESOLVED' } }, include: { owner: true } }),
    prisma.finding.findMany({ where: { caseId, module: 'ONEVOICE', stale: false, reviewStatus: { in: ['PENDING', 'CONFIRMED'] } } }),
    prisma.task.findMany({ where: { caseId, status: { not: 'DONE' } }, orderBy: { dueDate: 'asc' } }),
    prisma.finding.findFirst({ where: { caseId, module: 'BRIDGE', kind: 'CORE_PROBLEM', reviewStatus: 'CONFIRMED' } }),
  ]);
  const last = sources[sources.length - 1];
  const pkg: HandoverPackage = {
    customerGoal: c.coreNeed ?? coreProblem?.title ?? c.initialRequest,
    currentState: `İş vəziyyəti: ${c.status}; satış nəticəsi: ${c.salesOutcome}.${last ? ` Son mənbə: "${last.title}" (${fmt(last.occurredAt)}, ${last.author}).` : ''}`,
    agreements: commitments.map((k) => k.text),
    openBlockers: blockers.map(
      (b) => `[${b.category}] ${b.title}${b.nextStep ? ` — növbəti addım: ${b.nextStep}` : ''}${b.dueDate ? ` (son tarix ${fmt(b.dueDate)})` : ''} — vəziyyət: ${b.status}`,
    ),
    contradictions: contradictions.map((f) => `${f.title} — ${f.reviewStatus === 'CONFIRMED' ? 'təsdiqlənib, düzəliş gözləyir' : 'yoxlanılmayıb'}`),
    collectedInfo: sources
      .filter((s) => s.authorSide === 'CUSTOMER' || s.type === 'DOCUMENT' || s.type === 'CONTRACT' || s.type === 'PROPOSAL')
      .map((s) => `${s.title} (${s.type}, ${fmt(s.occurredAt)}, ${s.author})`),
    doNotAsk: extractAnsweredQuestions(sources),
    nextSteps: [
      ...tasks.map((t) => ({ text: t.title, dueDate: t.dueDate ? fmt(t.dueDate) : undefined })),
      ...blockers.filter((b) => b.nextStep).map((b) => ({ text: b.nextStep!, dueDate: b.dueDate ? fmt(b.dueDate) : undefined })),
    ],
    notes: [],
  };

  const provider = await getProvider();
  if (!provider) {
    pkg.notes.push('Demo rejimi: paket mövcud məlumatlardan qayda əsasında yığılıb (real AI xülasəsi deyil).');
    return { pkg, origin: 'RULES', model: null };
  }
  try {
    const ctx = await buildCaseContext(caseId, 'RELAY');
    const text = await provider.completeJson({ system: SYSTEM_PROMPT, user: `${HANDOVER_TASK}\n\n${renderContext(ctx)}` });
    const start = text.indexOf('{');
    const parsed = AiHandoverOut.parse(JSON.parse(text.slice(start, text.lastIndexOf('}') + 1)));
    pkg.customerGoal = parsed.customerGoal || pkg.customerGoal;
    pkg.currentState = parsed.currentState || pkg.currentState;
    for (const d of parsed.doNotAsk) {
      const src = ctx.sourceLookup.get(d.sourceRef);
      if (!src) continue;
      const ev = verifyEvidence(src, d.quote);
      if (!ev.verified) continue; // unverified quotes are never shown as evidence
      if (pkg.doNotAsk.some((x) => x.sourceId === src.id && x.quote === ev.quote)) continue;
      pkg.doNotAsk.push({ question: d.question, answer: d.answer, sourceId: src.id, quote: ev.quote });
    }
    pkg.notes.push(...parsed.notes);
    if (ctx.truncated) pkg.notes.push('Giriş limiti səbəbindən bəzi mənbə fraqmentləri AI-yə göndərilmədi.');
    return { pkg, origin: provider.origin, model: provider.model };
  } catch (e) {
    pkg.notes.push(`AI xülasəsi alınmadı (${(e as Error).message}); paket mövcud məlumatlardan yığılıb.`);
    return { pkg, origin: 'RULES', model: null };
  }
}

export interface DraftWarning {
  draftQuestion: string;
  previousQuestion: string;
  answer: string;
  sourceId: string;
  sourceTitle: string;
  quote: string;
}

/** On-demand check: does a draft message re-ask something the customer already answered? */
export async function checkDraft(caseId: string, draft: string): Promise<DraftWarning[]> {
  const sources = await prisma.source.findMany({ where: { caseId, deletedAt: null }, orderBy: { occurredAt: 'asc' } });
  const handover = await prisma.handover.findFirst({ where: { caseId }, orderBy: { createdAt: 'desc' } });
  const pairs: AnsweredQuestion[] = [...extractAnsweredQuestions(sources)];
  if (handover) {
    const pkg = HandoverPackageSchema.safeParse(parseJson(handover.packageJson, {}));
    if (pkg.success)
      for (const d of pkg.data.doNotAsk)
        if (d.sourceId && d.quote) pairs.push({ question: d.question, answer: d.answer, sourceId: d.sourceId, quote: d.quote });
  }
  const questions = sentences(draft).filter((s) => s.text.endsWith('?'));
  const candidates = questions.length > 0 ? questions : sentences(draft);
  const warnings: DraftWarning[] = [];
  for (const q of candidates) {
    const qt = keyTokens(q.text);
    if (qt.size < 2) continue;
    let best: { score: number; p: AnsweredQuestion } | null = null;
    for (const p of pairs) {
      const score = Math.max(overlapRatio(qt, keyTokens(p.question)), overlapRatio(qt, keyTokens(p.answer)));
      if (score >= 0.5 && (!best || score > best.score)) best = { score, p };
    }
    if (best) {
      const src = sources.find((s) => s.id === best.p.sourceId);
      if (!src) continue;
      warnings.push({
        draftQuestion: q.text,
        previousQuestion: best.p.question,
        answer: best.p.answer,
        sourceId: src.id,
        sourceTitle: src.title,
        quote: best.p.quote,
      });
    }
  }
  return warnings;
}
