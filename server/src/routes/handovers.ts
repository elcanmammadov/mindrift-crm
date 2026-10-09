import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { actorOf, requireAuth, userOf } from '../auth/session.js';
import { assertCaseAccess } from '../auth/access.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/http.js';
import { toJson } from '../lib/json.js';
import { serializeHandover } from '../lib/serialize.js';
import { parseBody } from '../lib/validate.js';
import { HandoverPackageSchema } from '../analysis/schemas.js';
import { buildHandoverPackage, checkDraft } from '../modules/relay.js';
import { aiLimiter } from '../middleware/rateLimit.js';

export const handoversRouter = Router();
handoversRouter.use('/handovers', requireAuth);

const include = {
  fromUser: { select: { id: true, name: true } },
  toUser: { select: { id: true, name: true } },
  case: { select: { id: true, title: true, customer: { select: { id: true, name: true } } } },
} as const;

handoversRouter.get('/handovers', async (req, res) => {
  const user = userOf(req);
  const handovers = await prisma.handover.findMany({
    where: user.role === 'ADMIN' ? {} : { OR: [{ toUserId: user.id }, { fromUserId: user.id }] },
    include,
    orderBy: { createdAt: 'desc' },
  });
  res.json({ handovers: handovers.map(serializeHandover) });
});

/** Starts a handover: builds the package (AI in real mode) for the new owner to review. */
handoversRouter.post('/cases/:id/handovers', requireAuth, aiLimiter, async (req, res) => {
  const user = userOf(req);
  const kase = await assertCaseAccess(user, req.params.id as string);
  const body = parseBody(z.object({ toUserId: z.string().min(1) }), req.body);
  if (body.toUserId === kase.ownerId) throw badRequest('This employee already owns the case');
  const toUser = await prisma.user.findUnique({ where: { id: body.toUserId } });
  if (!toUser) throw notFound('User');
  const pending = await prisma.handover.findFirst({ where: { caseId: kase.id, status: 'PENDING' } });
  if (pending) throw conflict('HANDOVER_PENDING', 'There is already a pending handover for this case', { handoverId: pending.id });
  const { pkg, origin, model } = await buildHandoverPackage(kase.id);
  const handover = await prisma.handover.create({
    data: { caseId: kase.id, fromUserId: kase.ownerId, toUserId: toUser.id, packageJson: toJson(pkg), origin },
    include,
  });
  await audit(actorOf(req), 'HANDOVER_CREATED', {
    caseId: kase.id,
    details: { handoverId: handover.id, from: kase.ownerId, to: toUser.id, origin, model },
  });
  res.status(201).json({ handover: serializeHandover(handover) });
});

async function loadHandover(req: Parameters<typeof userOf>[0]) {
  const h = await prisma.handover.findUnique({ where: { id: req.params.id as string } });
  if (!h) throw notFound('Handover');
  await assertCaseAccess(userOf(req), h.caseId);
  return h;
}

handoversRouter.patch('/handovers/:id', async (req, res) => {
  const h = await loadHandover(req);
  if (h.status !== 'PENDING') throw conflict('HANDOVER_ACCEPTED', 'An accepted handover can no longer be edited');
  const body = parseBody(z.object({ package: HandoverPackageSchema }), req.body);
  const handover = await prisma.handover.update({ where: { id: h.id }, data: { packageJson: toJson(body.package) }, include });
  await audit(actorOf(req), 'HANDOVER_EDITED', { caseId: h.caseId, details: { handoverId: h.id } });
  res.json({ handover: serializeHandover(handover) });
});

/** Only the receiving employee can accept; ownership moves on acceptance. */
handoversRouter.post('/handovers/:id/accept', async (req, res) => {
  const h = await loadHandover(req);
  const user = userOf(req);
  if (h.toUserId !== user.id) throw forbidden('Only the receiving employee can accept this handover');
  if (h.status !== 'PENDING') throw conflict('HANDOVER_ACCEPTED', 'Already accepted');
  const [handover] = await prisma.$transaction([
    prisma.handover.update({ where: { id: h.id }, data: { status: 'ACCEPTED', acceptedAt: new Date() }, include }),
    prisma.customerCase.update({ where: { id: h.caseId }, data: { ownerId: user.id } }),
  ]);
  await audit(actorOf(req), 'HANDOVER_ACCEPTED', { caseId: h.caseId, details: { handoverId: h.id, from: h.fromUserId, to: user.id } });
  res.json({ handover: serializeHandover(handover) });
});

/** On-demand check (button) — warns if a draft asks something the customer already answered. */
handoversRouter.post('/cases/:id/draft-check', requireAuth, async (req, res) => {
  const kase = await assertCaseAccess(userOf(req), req.params.id as string);
  const body = parseBody(z.object({ draft: z.string().trim().min(3).max(10_000) }), req.body);
  const warnings = await checkDraft(kase.id, body.draft);
  res.json({ warnings });
});
