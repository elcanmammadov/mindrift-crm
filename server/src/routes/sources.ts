import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../db.js';
import { actorOf, requireAuth, userOf } from '../auth/session.js';
import { assertCaseAccess } from '../auth/access.js';
import { AUTHOR_SIDES, SOURCE_TYPES } from '../domain/enums.js';
import { HttpError, notFound } from '../lib/http.js';
import { parseBody, requiredDate, trimmed } from '../lib/validate.js';
import { createSource, deleteSource, extractUploadText, updateSource } from '../modules/sources.js';
import { aiLimiter } from '../middleware/rateLimit.js';
import { AiError } from '../ai/provider.js';
import { OCR_MIME_TYPES, extractImageText } from '../ai/ocr.js';

export const sourcesRouter = Router();
sourcesRouter.use(['/cases/:id/sources', '/sources'], requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

const SourceMeta = z.object({
  type: z.enum(SOURCE_TYPES),
  title: trimmed(1, 200),
  author: trimmed(1, 200),
  authorSide: z.enum(AUTHOR_SIDES),
  occurredAt: requiredDate,
  packageRef: z.string().trim().max(100).nullish(),
});
const SourceBody = SourceMeta.extend({
  content: trimmed(1, 500_000),
  origin: z.enum(['MANUAL', 'PASTE', 'CAMERA_OCR']).default('MANUAL'),
});

sourcesRouter.post('/cases/:id/sources', async (req, res) => {
  const user = userOf(req);
  const kase = await assertCaseAccess(user, req.params.id as string);
  const body = parseBody(SourceBody, req.body);
  const source = await createSource(kase.id, body, actorOf(req), user.id);
  res.status(201).json({ source });
});

sourcesRouter.post('/cases/:id/sources/upload', upload.single('file'), async (req, res) => {
  const user = userOf(req);
  const kase = await assertCaseAccess(user, req.params.id as string);
  if (!req.file) throw new HttpError(400, 'FILE_REQUIRED', 'Choose a TXT or PDF file');
  const meta = parseBody(SourceMeta, req.body);
  const extracted = await extractUploadText(req.file);
  if (!extracted.ok) {
    const messages: Record<string, string> = {
      PDF_NO_TEXT: 'No text could be extracted from this PDF (it may be scanned). OCR is not supported — paste the text instead.',
      EMPTY_FILE: 'The file is empty.',
      UNSUPPORTED_TYPE: 'Only TXT and text-based PDF files are supported.',
    };
    throw new HttpError(422, extracted.code, messages[extracted.code] ?? 'Could not read the file');
  }
  const source = await createSource(kase.id, { ...meta, content: extracted.text, origin: extracted.origin }, actorOf(req), user.id);
  res.status(201).json({ source });
});

/** Camera / photo OCR: returns the recognised text for the user to review; the source is saved only after confirmation. */
sourcesRouter.post('/cases/:id/sources/ocr', aiLimiter, upload.single('file'), async (req, res) => {
  await assertCaseAccess(userOf(req), req.params.id as string);
  if (!req.file) throw new HttpError(400, 'FILE_REQUIRED', 'Take or choose a photo');
  if (!OCR_MIME_TYPES.includes(req.file.mimetype as (typeof OCR_MIME_TYPES)[number])) {
    throw new HttpError(422, 'UNSUPPORTED_IMAGE', 'Only JPEG, PNG and WebP images are supported.');
  }
  try {
    const text = await extractImageText(req.file.buffer, req.file.mimetype);
    if (!text) throw new HttpError(422, 'OCR_NO_TEXT', 'No readable text was found in the photo.');
    res.json({ text });
  } catch (err) {
    if (!(err instanceof AiError)) throw err;
    if (err.code === 'NOT_CONFIGURED') throw new HttpError(503, 'NO_API_KEY', err.message);
    if (err.code === 'RATE_LIMITED') throw new HttpError(429, 'RATE_LIMITED', err.message);
    throw new HttpError(502, err.code, err.message);
  }
});

async function loadSource(req: Parameters<typeof userOf>[0], id: string) {
  const source = await prisma.source.findUnique({ where: { id } });
  if (!source) throw notFound('Source');
  await assertCaseAccess(userOf(req), source.caseId);
  return source;
}

/** Source with its revision history and stable chunks (used when a user clicks an evidence quote). */
sourcesRouter.get('/sources/:id', async (req, res) => {
  const source = await loadSource(req, req.params.id as string);
  const [revisions, chunks] = await Promise.all([
    prisma.sourceRevision.findMany({ where: { sourceId: source.id }, orderBy: { version: 'desc' } }),
    prisma.sourceChunk.findMany({ where: { sourceId: source.id }, orderBy: [{ version: 'desc' }, { index: 'asc' }] }),
  ]);
  res.json({ source, revisions, chunks });
});

sourcesRouter.patch('/sources/:id', async (req, res) => {
  const source = await loadSource(req, req.params.id as string);
  const body = parseBody(SourceBody.partial(), req.body);
  const updated = await updateSource(source.id, body, actorOf(req), userOf(req).id);
  res.json({ source: updated });
});

sourcesRouter.delete('/sources/:id', async (req, res) => {
  const source = await loadSource(req, req.params.id as string);
  await deleteSource(source.id, actorOf(req));
  res.json({ ok: true });
});
