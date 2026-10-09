import type { Customer, CustomerCase, Source } from '@prisma/client';
import { prisma } from '../db.js';
import { env } from '../env.js';
import type { ModuleId } from '../domain/enums.js';
import { chunkText } from '../modules/sources.js';

export interface CtxSource {
  alias: string;
  source: Source;
  /** Chunk indexes of the current version that were sent to the model. */
  includedChunks: number;
  totalChunks: number;
}

export interface RelatedCaseCtx {
  alias: string;
  caseRow: CustomerCase;
  sources: CtxSource[];
}

export interface CaseContext {
  caseRow: CustomerCase & { customer: Customer };
  sources: CtxSource[];
  related: RelatedCaseCtx[];
  /** alias -> source id and source id -> source id */
  sourceLookup: Map<string, Source>;
  caseLookup: Map<string, CustomerCase>;
  truncated: boolean;
  omitted: { alias: string; title: string; chunks: number }[];
  snapshot: { sourceId: string; version: number; contentHash: string }[];
}

const fmtDate = (d: Date) => d.toISOString().slice(0, 16).replace('T', ' ');

function escapeAttr(s: string) {
  return s.replace(/"/g, "'").replace(/[<>]/g, '');
}

/**
 * Loads a case with its sources (oldest first) and, for modules that need it,
 * the customer's other cases. Applies a character budget: when the sources do
 * not fit, the remaining fragments are skipped and reported back to the user.
 */
export async function buildCaseContext(caseId: string, module: ModuleId): Promise<CaseContext> {
  const caseRow = await prisma.customerCase.findUniqueOrThrow({ where: { id: caseId }, include: { customer: true } });
  const sources = await prisma.source.findMany({
    where: { caseId, deletedAt: null },
    orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
  });

  let budget = env.AI_MAX_INPUT_CHARS;
  const omitted: CaseContext['omitted'] = [];
  const sourceLookup = new Map<string, Source>();
  const caseLookup = new Map<string, CustomerCase>();

  const take = (s: Source, alias: string): CtxSource => {
    sourceLookup.set(alias, s);
    sourceLookup.set(s.id, s);
    const chunks = chunkText(s.content);
    let included = 0;
    for (const c of chunks) {
      if (c.text.length > budget) break;
      budget -= c.text.length;
      included++;
    }
    if (included < chunks.length) omitted.push({ alias, title: s.title, chunks: chunks.length - included });
    return { alias, source: s, includedChunks: included, totalChunks: chunks.length };
  };

  const ctxSources = sources.map((s, i) => take(s, `S${i + 1}`));

  const related: RelatedCaseCtx[] = [];
  if (module === 'LOOP' || module === 'EXITLENS') {
    const others = await prisma.customerCase.findMany({
      where: { customerId: caseRow.customerId, id: { not: caseId } },
      orderBy: { createdAt: 'asc' },
    });
    let p = 1;
    for (const [i, other] of others.entries()) {
      const alias = `C${i + 1}`;
      caseLookup.set(alias, other);
      caseLookup.set(other.id, other);
      const otherSources = await prisma.source.findMany({
        where: { caseId: other.id, deletedAt: null },
        orderBy: { occurredAt: 'asc' },
      });
      related.push({ alias, caseRow: other, sources: otherSources.map((s) => take(s, `P${p++}`)) });
    }
  }

  return {
    caseRow,
    sources: ctxSources,
    related,
    sourceLookup,
    caseLookup,
    truncated: omitted.length > 0,
    omitted,
    snapshot: [...sources, ...related.flatMap((r) => r.sources.map((s) => s.source))].map((s) => ({
      sourceId: s.id,
      version: s.version,
      contentHash: s.contentHash,
    })),
  };
}

function renderSource(cs: CtxSource): string {
  const s = cs.source;
  const chunks = chunkText(s.content).slice(0, cs.includedChunks);
  const body = chunks.map((c) => c.text).join('');
  const cut = cs.includedChunks < cs.totalChunks ? '\n[... rest of this source was not included because of the input limit ...]' : '';
  return (
    `<source id="${cs.alias}" type="${s.type}" side="${s.authorSide}" author="${escapeAttr(s.author)}" date="${fmtDate(s.occurredAt)}"` +
    `${s.packageRef ? ` package="${escapeAttr(s.packageRef)}"` : ''} title="${escapeAttr(s.title)}">\n${body}${cut}\n</source>`
  );
}

/** Renders the context as delimited, untrusted data for the prompt. */
export function renderContext(ctx: CaseContext): string {
  const c = ctx.caseRow;
  const parts = [
    `<case title="${escapeAttr(c.title)}" status="${c.status}" salesOutcome="${c.salesOutcome}" customer="${escapeAttr(c.customer.name)}" customerStatus="${c.customer.status}">`,
    `Initial request (recorded by staff): ${c.initialRequest}`,
    c.coreNeed ? `Core need (recorded by staff): ${c.coreNeed}` : '',
    '</case>',
    ...ctx.sources.map(renderSource),
  ];
  for (const r of ctx.related) {
    parts.push(
      `<previous_case id="${r.alias}" title="${escapeAttr(r.caseRow.title)}" status="${r.caseRow.status}" created="${fmtDate(r.caseRow.createdAt)}"` +
        `${r.caseRow.closeReason ? ` closeNote="${escapeAttr(r.caseRow.closeReason)}"` : ''}>\nInitial request: ${r.caseRow.initialRequest}`,
      ...r.sources.map(renderSource),
      '</previous_case>',
    );
  }
  return parts.filter(Boolean).join('\n\n');
}
