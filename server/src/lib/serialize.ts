import type { AnalysisRun, Evidence, Finding, Handover, Source } from '@prisma/client';
import { parseJson } from './json.js';

export function serializeFinding(f: Finding & { evidence?: (Evidence & { source?: Source | null })[] }) {
  return {
    ...f,
    data: parseJson<Record<string, unknown>>(f.data, {}),
    translations: parseJson<Record<string, unknown>>(f.translations, {}),
    evidence: (f.evidence ?? []).map((e) => ({
      id: e.id,
      sourceId: e.sourceId,
      sourceVersion: e.sourceVersion,
      chunkId: e.chunkId,
      quote: e.quote,
      startOffset: e.startOffset,
      endOffset: e.endOffset,
      verified: e.verified,
      label: e.label,
      sourceTitle: e.source?.title,
      sourceAuthor: e.source?.author,
      sourceDate: e.source?.occurredAt,
      sourceType: e.source?.type,
      /** The source was edited after this evidence was recorded. */
      sourceChanged: e.source ? e.source.version !== e.sourceVersion || !!e.source.deletedAt : false,
    })),
  };
}

export function serializeRun(r: AnalysisRun) {
  return {
    ...r,
    modules: parseJson<string[]>(r.modules, []),
    sourceSnapshot: parseJson<unknown[]>(r.sourceSnapshot, []),
    notes: parseJson<unknown[]>(r.notes, []),
    stats: parseJson<Record<string, number>>(r.stats, {}),
    error: parseJson<unknown>(r.error, r.error),
  };
}

export function serializeHandover(h: Handover & Record<string, unknown>) {
  return { ...h, package: parseJson<Record<string, unknown>>(h.packageJson, {}), packageJson: undefined };
}
