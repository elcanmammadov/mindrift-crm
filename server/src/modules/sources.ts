import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { sha256 } from '../lib/text.js';
import { audit, type Actor } from '../lib/audit.js';

const CHUNK_TARGET = 1200;

/**
 * Splits a source into stable fragments on paragraph / sentence boundaries.
 * Chunk ids are deterministic (<sourceId>:v<version>:<index>) so evidence links stay valid.
 */
export function chunkText(text: string, target = CHUNK_TARGET): { start: number; end: number; text: string }[] {
  const chunks: { start: number; end: number; text: string }[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + target);
    if (end < text.length) {
      const window = text.slice(start, end);
      const para = window.lastIndexOf('\n\n');
      const sentence = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '), window.lastIndexOf('\n'));
      const cut = para > target * 0.4 ? para + 2 : sentence > target * 0.4 ? sentence + 2 : -1;
      if (cut > 0) end = start + cut;
    }
    const slice = text.slice(start, end);
    if (slice.trim().length > 0) chunks.push({ start, end, text: slice });
    start = end;
  }
  return chunks;
}

async function writeChunks(tx: Prisma.TransactionClient, sourceId: string, version: number, content: string) {
  const chunks = chunkText(content);
  await tx.sourceChunk.createMany({
    data: chunks.map((c, index) => ({
      id: `${sourceId}:v${version}:${index}`,
      sourceId,
      version,
      index,
      startOffset: c.start,
      endOffset: c.end,
      text: c.text,
    })),
  });
}

export interface SourceInput {
  type: string;
  origin?: string;
  title: string;
  author: string;
  authorSide: string;
  occurredAt: Date;
  packageRef?: string | null;
  content: string;
}

export async function createSource(caseId: string, input: SourceInput, actor: Actor, createdById?: string) {
  const content = input.content.replace(/\r\n/g, '\n');
  const source = await prisma.$transaction(async (tx) => {
    const s = await tx.source.create({
      data: {
        caseId,
        type: input.type,
        origin: input.origin ?? 'MANUAL',
        title: input.title,
        author: input.author,
        authorSide: input.authorSide,
        occurredAt: input.occurredAt,
        packageRef: input.packageRef || null,
        content,
        contentHash: sha256(content),
        createdById: createdById ?? null,
      },
    });
    await tx.sourceRevision.create({ data: { sourceId: s.id, version: 1, content, contentHash: s.contentHash, editedById: createdById ?? null } });
    await writeChunks(tx, s.id, 1, content);
    await tx.customerCase.update({ where: { id: caseId }, data: { sourcesRevision: { increment: 1 } } });
    return s;
  });
  await audit(actor, 'SOURCE_ADDED', { caseId, details: { sourceId: source.id, title: source.title, type: source.type } });
  return source;
}

export async function updateSource(sourceId: string, input: Partial<SourceInput>, actor: Actor, editedById?: string) {
  const existing = await prisma.source.findUniqueOrThrow({ where: { id: sourceId } });
  const content = input.content?.replace(/\r\n/g, '\n');
  const contentChanged = content !== undefined && sha256(content) !== existing.contentHash;
  const updated = await prisma.$transaction(async (tx) => {
    const version = contentChanged ? existing.version + 1 : existing.version;
    const s = await tx.source.update({
      where: { id: sourceId },
      data: {
        type: input.type,
        title: input.title,
        author: input.author,
        authorSide: input.authorSide,
        occurredAt: input.occurredAt,
        packageRef: input.packageRef === undefined ? undefined : input.packageRef || null,
        ...(contentChanged ? { content, contentHash: sha256(content!), version } : {}),
      },
    });
    if (contentChanged) {
      await tx.sourceRevision.create({ data: { sourceId, version, content: content!, contentHash: s.contentHash, editedById: editedById ?? null } });
      await writeChunks(tx, sourceId, version, content!);
    }
    // Metadata (date, package, side) also influences analysis, so any edit makes the last analysis outdated.
    await tx.customerCase.update({ where: { id: existing.caseId }, data: { sourcesRevision: { increment: 1 } } });
    return s;
  });
  await audit(actor, 'SOURCE_EDITED', {
    caseId: existing.caseId,
    details: { sourceId, contentChanged, version: updated.version },
  });
  return updated;
}

export async function deleteSource(sourceId: string, actor: Actor) {
  const existing = await prisma.source.findUniqueOrThrow({ where: { id: sourceId } });
  await prisma.$transaction([
    prisma.source.update({ where: { id: sourceId }, data: { deletedAt: new Date() } }),
    prisma.customerCase.update({ where: { id: existing.caseId }, data: { sourcesRevision: { increment: 1 } } }),
  ]);
  await audit(actor, 'SOURCE_ARCHIVED', { caseId: existing.caseId, details: { sourceId, title: existing.title } });
}

/** Extracts text from an uploaded TXT or text-based PDF. Scanned PDFs (no text layer) are rejected. */
export async function extractUploadText(file: { buffer: Buffer; mimetype: string; originalname: string }) {
  const name = file.originalname.toLowerCase();
  if (file.mimetype === 'application/pdf' || name.endsWith('.pdf')) {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(file.buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    const clean = (Array.isArray(text) ? text.join('\n\n') : text).trim();
    if (clean.replace(/\s+/g, '').length < 20) {
      return { ok: false as const, code: 'PDF_NO_TEXT' };
    }
    return { ok: true as const, text: clean, origin: 'UPLOAD_PDF' };
  }
  if (file.mimetype.startsWith('text/') || name.endsWith('.txt')) {
    const text = file.buffer.toString('utf8').replace(/^\uFEFF/, '').trim();
    if (!text) return { ok: false as const, code: 'EMPTY_FILE' };
    return { ok: true as const, text, origin: 'UPLOAD_TXT' };
  }
  return { ok: false as const, code: 'UNSUPPORTED_TYPE' };
}
