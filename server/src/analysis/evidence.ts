import type { Source } from '@prisma/client';
import { MODULE_KINDS, type ModuleId } from '../domain/enums.js';
import { findQuote, keyTokens, jaccard, normalize, sha256 } from '../lib/text.js';
import { chunkText } from '../modules/sources.js';
import {
  BlockerData,
  BlockerResolutionData,
  ContradictionData,
  RepeatData,
  VerdictData,
  type FindingOut,
  type ModuleOut,
} from './schemas.js';

export interface ProcessedEvidence {
  sourceId: string;
  sourceVersion: number;
  chunkId: string | null;
  quote: string;
  startOffset: number | null;
  endOffset: number | null;
  verified: boolean;
  label: string | null;
}

export interface ProcessedFinding {
  kind: string;
  title: string;
  explanation: string;
  epistemic: 'OBSERVED' | 'INFERRED';
  strength: 'STRONG' | 'MEDIUM' | 'WEAK';
  suggestedAction: string | null;
  evidence: ProcessedEvidence[];
  data: Record<string, unknown>;
  translations: Record<string, unknown>;
  existingFindingId?: string;
  fingerprint: string;
}

export interface RunNote {
  level: 'info' | 'warning';
  code: string;
  text: string;
  textEn?: string;
}

export interface ProcessOptions {
  /** alias or id -> source */
  sourceLookup: Map<string, Source>;
  /** alias or id -> case id (LOOP) */
  caseLookup?: Map<string, { id: string }>;
  /** alias (B1..) or id -> blocker id (UNBLOCK) */
  blockerLookup?: Map<string, string>;
  /** alias (K1..) or id -> criterion id (PROOFCLOSE) */
  criterionLookup?: Map<string, string>;
  /** Extra fingerprint salt, e.g. input hash for one-per-evaluation verdicts. */
  fingerprintSalt?: string;
}

/** Verifies that a quote exists in the referenced source and locates its chunk. */
export function verifyEvidence(source: Source, quote: string, label?: string): ProcessedEvidence {
  const loc = findQuote(source.content, quote);
  let chunkId: string | null = null;
  if (loc) {
    const idx = chunkText(source.content).findIndex((c) => loc.start >= c.start && loc.start < c.end);
    if (idx >= 0) chunkId = `${source.id}:v${source.version}:${idx}`;
  }
  return {
    sourceId: source.id,
    sourceVersion: source.version,
    chunkId,
    quote: loc ? source.content.slice(loc.start, loc.end) : quote,
    startOffset: loc?.start ?? null,
    endOffset: loc?.end ?? null,
    verified: !!loc,
    label: label ?? null,
  };
}

const normPkg = (p: string | null | undefined) => (p ? normalize(p).replace(/[^\p{L}\p{N}]/gu, '') : '');

/**
 * Deterministic guards on contradictions, applied to AI and rule output alike:
 * - two verified quotes are required,
 * - statements about different packages are not a contradiction,
 * - a later accepted change (agreed discount, amended contract) is not a contradiction,
 * - "cannot tell which applies" becomes a clarification request.
 * Returns null when the finding must be dropped (with the reason).
 */
export function guardContradiction(
  f: { kind: string; evidence: ProcessedEvidence[]; data: Record<string, unknown> },
  sourceLookup: Map<string, Source>,
): { kind: string; data: Record<string, unknown> } | { drop: string } {
  const data = ContradictionData.parse(f.data);
  if (data.resolvedByLaterAgreement) return { drop: 'ACCEPTED_LATER_CHANGE' };
  const verified = f.evidence.filter((e) => e.verified);
  if (f.kind === 'CONTRADICTION') {
    const distinct = new Set(verified.map((e) => `${e.sourceId}:${e.startOffset}`));
    if (distinct.size < 2) return { drop: 'CONTRADICTION_WITHOUT_TWO_QUOTES' };
  }
  const sideA = verified.find((e) => e.label === 'A') ?? verified[0];
  const sideB = verified.find((e) => e.label === 'B' && e !== sideA) ?? verified.find((e) => e.sourceId !== sideA?.sourceId);
  if (sideA && sideB) {
    const pa = normPkg(sourceLookup.get(sideA.sourceId)?.packageRef);
    const pb = normPkg(sourceLookup.get(sideB.sourceId)?.packageRef);
    if (pa && pb && pa !== pb) return { drop: 'DIFFERENT_PACKAGES' };
  }
  const kind = data.effectiveStatus === 'UNKNOWN_WHICH_APPLIES' ? 'NEEDS_CLARIFICATION' : f.kind;
  return { kind, data };
}

const DROP_TEXT: Record<string, [string, string]> = {
  UNKNOWN_KIND: ['Naməlum nəticə növü olduğu üçün nəticə göstərilmədi.', 'A result with an unknown type was discarded.'],
  ACCEPTED_LATER_CHANGE: [
    'Sonradan razılaşdırılmış dəyişiklik ziddiyyət sayılmadı.',
    'A later agreed change was not treated as a contradiction.',
  ],
  CONTRADICTION_WITHOUT_TWO_QUOTES: [
    'İki doğrulanmış sitatı olmayan ziddiyyət göstərilmədi.',
    'A contradiction without two verified quotes was discarded.',
  ],
  DIFFERENT_PACKAGES: [
    'Fərqli paketlərə aid ifadələr ziddiyyət sayılmadı.',
    'Statements about different packages were not treated as a contradiction.',
  ],
  INVALID_DATA: ['Struktur yoxlamasından keçməyən nəticə göstərilmədi.', 'A result that failed validation was discarded.'],
  UNKNOWN_BLOCKER: ['Mövcud olmayan maneəyə istinad edən təklif göstərilmədi.', 'A suggestion referencing an unknown blocker was discarded.'],
  UNKNOWN_CASE: ['Mövcud olmayan işə istinad edən nəticə göstərilmədi.', 'A result referencing an unknown case was discarded.'],
};

export function processModuleOutput(
  module: ModuleId,
  out: ModuleOut,
  opts: ProcessOptions,
): { findings: ProcessedFinding[]; notes: RunNote[] } {
  const notes: RunNote[] = [];
  const findings: ProcessedFinding[] = [];
  const dropCount: Record<string, number> = {};
  let unknownRefs = 0;
  let unverified = 0;
  const drop = (code: string) => (dropCount[code] = (dropCount[code] ?? 0) + 1);

  for (const raw of out.findings as FindingOut[]) {
    if (!MODULE_KINDS[module].includes(raw.kind)) {
      drop('UNKNOWN_KIND');
      continue;
    }
    const evidence: ProcessedEvidence[] = [];
    for (const ev of raw.evidence) {
      const src = opts.sourceLookup.get(ev.sourceRef.trim());
      if (!src) {
        unknownRefs++;
        continue;
      }
      const pe = verifyEvidence(src, ev.quote, ev.label);
      if (!pe.verified) unverified++;
      evidence.push(pe);
    }

    let kind = raw.kind;
    let data: Record<string, unknown> = { ...(raw.data ?? {}) };
    let epistemic = raw.epistemic;
    let strength = raw.strength;
    const verifiedEv = evidence.filter((e) => e.verified);

    try {
      if (module === 'ONEVOICE') {
        const g = guardContradiction({ kind, evidence, data }, opts.sourceLookup);
        if ('drop' in g) {
          drop(g.drop);
          continue;
        }
        kind = g.kind;
        data = g.data;
      } else if (module === 'UNBLOCK' && kind === 'BLOCKER') {
        data = BlockerData.parse(data);
      } else if (module === 'UNBLOCK' && kind === 'BLOCKER_RESOLUTION') {
        const d = BlockerResolutionData.parse(data);
        const blockerId = opts.blockerLookup?.get(d.blockerRef);
        if (!blockerId) {
          drop('UNKNOWN_BLOCKER');
          continue;
        }
        data = { blockerId };
      } else if (module === 'LOOP') {
        const d = RepeatData.parse(data);
        const related = opts.caseLookup?.get(d.relatedCaseRef);
        if (!related) {
          drop('UNKNOWN_CASE');
          continue;
        }
        data = { ...d, relatedCaseId: related.id };
      } else if (module === 'PROOFCLOSE') {
        const d = VerdictData.parse(data);
        data = {
          verdict: d.verdict,
          criteria: d.criteria
            .map((c) => ({ ...c, criterionId: opts.criterionLookup?.get(c.criterionRef) }))
            .filter((c) => c.criterionId),
        };
      }
    } catch {
      drop('INVALID_DATA');
      continue;
    }

    // A claim presented as directly observed must be backed by at least one verified quote.
    if (epistemic === 'OBSERVED' && verifiedEv.length === 0) {
      epistemic = 'INFERRED';
      strength = 'WEAK';
    }

    let key: string;
    if (module === 'LOOP') key = String(data.relatedCaseId);
    else if (kind === 'BLOCKER_RESOLUTION') key = String(data.blockerId);
    else if (module === 'PROOFCLOSE') key = opts.fingerprintSalt ?? 'verdict';
    else if (verifiedEv.length > 0)
      key = verifiedEv
        .map((e) => `${e.sourceId}@${normalize(e.quote).slice(0, 80)}`)
        .sort()
        .join('|');
    else key = normalize(raw.title);

    findings.push({
      kind,
      title: raw.title,
      explanation: raw.explanation,
      epistemic,
      strength,
      suggestedAction: raw.suggestedAction ?? null,
      evidence,
      data,
      translations: raw.en ? { en: raw.en } : {},
      existingFindingId: raw.existingFindingId,
      fingerprint: sha256(`${module}|${kind}|${key}`).slice(0, 40),
    });
  }

  for (const [code, n] of Object.entries(dropCount)) {
    const [az, en] = DROP_TEXT[code] ?? [code, code];
    notes.push({ level: 'info', code, text: `${az} (${n})`, textEn: `${en} (${n})` });
  }
  if (unknownRefs > 0)
    notes.push({
      level: 'warning',
      code: 'UNKNOWN_SOURCE_REF',
      text: `AI mövcud olmayan mənbəyə ${unknownRefs} dəfə istinad etdi; bu istinadlar atıldı.`,
      textEn: `The AI referenced non-existent sources ${unknownRefs} time(s); those references were dropped.`,
    });
  if (unverified > 0)
    notes.push({
      level: 'warning',
      code: 'UNVERIFIED_QUOTES',
      text: `${unverified} sitat mənbədə tapılmadı və sübut kimi sayılmır.`,
      textEn: `${unverified} quote(s) were not found in the source and are not counted as evidence.`,
    });
  return { findings, notes };
}

/** Same-issue detection between a new result and stored findings (to avoid duplicates across re-runs). */
export function isSameFinding(
  a: { kind: string; title: string; evidence: { sourceId: string; startOffset: number | null; endOffset: number | null; verified: boolean }[] },
  b: { kind: string; title: string; evidence: { sourceId: string; startOffset: number | null; endOffset: number | null; verified: boolean }[] },
): boolean {
  if (a.kind !== b.kind) return false;
  const ea = a.evidence.filter((e) => e.verified && e.startOffset !== null);
  const eb = b.evidence.filter((e) => e.verified && e.startOffset !== null);
  if (ea.length > 0 && eb.length > 0) {
    // Same issue if every quote of one side overlaps a quote of the other.
    const overlaps = (x: (typeof ea)[0], y: (typeof eb)[0]) =>
      x.sourceId === y.sourceId && x.startOffset! < y.endOffset! && y.startOffset! < x.endOffset!;
    const small = ea.length <= eb.length ? ea : eb;
    const big = small === ea ? eb : ea;
    if (small.every((x) => big.some((y) => overlaps(x, y)))) return true;
  }
  return jaccard(keyTokens(a.title), keyTokens(b.title)) >= 0.6;
}
