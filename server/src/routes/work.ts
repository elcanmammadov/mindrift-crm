import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { actorOf, requireAuth, userOf } from '../auth/session.js';
import { assertCaseAccess, caseScope } from '../auth/access.js';
import { BLOCKER_CATEGORIES, BLOCKER_STATUSES, CRITERION_STATUSES, TASK_STATUSES } from '../domain/enums.js';
import { audit } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/http.js';
import { optionalDate, parseBody, trimmed } from '../lib/validate.js';
import { issueCustomerToken } from '../modules/tokens.js';

/** Blockers, tasks, commitments, resolution criteria, case relations and the board. */
export const workRouter = Router();
workRouter.use(['/blockers', '/tasks', '/commitments', '/criteria', '/relations', '/board'], requireAuth);
workRouter.use('/cases/:id', requireAuth);

async function caseOfEntity(req: Request, caseId: string | null | undefined) {
  if (!caseId) throw notFound();
  return assertCaseAccess(userOf(req), caseId);
}

// ------------------------------------------------------------- board
workRouter.get('/board', async (req, res) => {
  const user = userOf(req);
  const scope = { case: caseScope(user) };
  const [blockers, tasks] = await Promise.all([
    prisma.blocker.findMany({
      where: scope,
      include: { owner: { select: { id: true, name: true } }, case: { select: { id: true, title: true, customer: { select: { name: true } } } } },
      orderBy: [{ dueDate: 'asc' }],
    }),
    prisma.task.findMany({
      where: user.role === 'ADMIN' ? {} : { OR: [scope, { assigneeId: user.id }] },
      include: { assignee: { select: { id: true, name: true } }, case: { select: { id: true, title: true, customer: { select: { name: true } } } } },
      orderBy: [{ dueDate: 'asc' }],
    }),
  ]);
  res.json({ blockers, tasks });
});

// ------------------------------------------------------------- blockers
const BlockerBody = z.object({
  title: trimmed(3, 300),
  category: z.enum(BLOCKER_CATEGORIES),
  description: z.string().max(4000).nullish(),
  ownerId: z.string().nullish(),
  nextStep: z.string().max(2000).nullish(),
  dueDate: optionalDate,
  resolutionCriteria: z.string().max(2000).nullish(),
  status: z.enum(BLOCKER_STATUSES).default('OPEN'),
  sourceId: z.string().nullish(),
  evidenceQuote: z.string().max(2000).nullish(),
});

workRouter.post('/cases/:id/blockers', async (req, res) => {
  const kase = await assertCaseAccess(userOf(req), req.params.id as string);
  const body = parseBody(BlockerBody, req.body);
  const blocker = await prisma.blocker.create({ data: { ...body, caseId: kase.id, ownerId: body.ownerId ?? userOf(req).id } });
  await audit(actorOf(req), 'BLOCKER_CREATED', { caseId: kase.id, details: { blockerId: blocker.id, title: blocker.title } });
  res.status(201).json({ blocker });
});

workRouter.patch('/blockers/:id', async (req, res) => {
  const b = await prisma.blocker.findUnique({ where: { id: req.params.id as string } });
  if (!b) throw notFound('Blocker');
  await caseOfEntity(req, b.caseId);
  const body = parseBody(BlockerBody.partial(), req.body);
  const resolving = body.status === 'RESOLVED' && b.status !== 'RESOLVED';
  const blocker = await prisma.blocker.update({
    where: { id: b.id },
    data: { ...body, ...(resolving ? { resolvedAt: new Date() } : body.status && body.status !== 'RESOLVED' ? { resolvedAt: null } : {}) },
  });
  await audit(actorOf(req), resolving ? 'BLOCKER_RESOLVED' : 'BLOCKER_UPDATED', { caseId: b.caseId, details: { blockerId: b.id, changes: body } });
  res.json({ blocker });
});

// ------------------------------------------------------------- tasks
const TaskBody = z.object({
  title: trimmed(3, 300),
  description: z.string().max(4000).nullish(),
  assigneeId: z.string().nullish(),
  dueDate: optionalDate,
  status: z.enum(TASK_STATUSES).default('TODO'),
  blockerId: z.string().nullish(),
});

workRouter.post('/cases/:id/tasks', async (req, res) => {
  const kase = await assertCaseAccess(userOf(req), req.params.id as string);
  const body = parseBody(TaskBody, req.body);
  if (body.blockerId && !(await prisma.blocker.findFirst({ where: { id: body.blockerId, caseId: kase.id } }))) throw badRequest('Blocker belongs to another case');
  const task = await prisma.task.create({ data: { ...body, caseId: kase.id, assigneeId: body.assigneeId ?? userOf(req).id } });
  await audit(actorOf(req), 'TASK_CREATED', { caseId: kase.id, details: { taskId: task.id, title: task.title } });
  res.status(201).json({ task });
});

async function loadTask(req: Request) {
  const t = await prisma.task.findUnique({ where: { id: req.params.id as string } });
  if (!t) throw notFound('Task');
  const user = userOf(req);
  if (t.caseId) await caseOfEntity(req, t.caseId);
  else if (user.role !== 'ADMIN' && t.assigneeId !== user.id) throw notFound('Task');
  return t;
}

workRouter.patch('/tasks/:id', async (req, res) => {
  const t = await loadTask(req);
  const body = parseBody(TaskBody.partial(), req.body);
  const task = await prisma.task.update({ where: { id: t.id }, data: body });
  await audit(actorOf(req), 'TASK_UPDATED', { caseId: t.caseId, details: { taskId: t.id, changes: body } });
  res.json({ task });
});

workRouter.delete('/tasks/:id', async (req, res) => {
  const t = await loadTask(req);
  await prisma.task.delete({ where: { id: t.id } });
  await audit(actorOf(req), 'TASK_DELETED', { caseId: t.caseId, details: { taskId: t.id, title: t.title } });
  res.json({ ok: true });
});

// ------------------------------------------------------------- commitments
workRouter.post('/cases/:id/commitments', async (req, res) => {
  const kase = await assertCaseAccess(userOf(req), req.params.id as string);
  const body = parseBody(z.object({ text: trimmed(3, 2000), sourceId: z.string().nullish() }), req.body);
  const commitment = await prisma.commitment.create({ data: { caseId: kase.id, text: body.text, sourceId: body.sourceId ?? null } });
  await audit(actorOf(req), 'COMMITMENT_ADDED', { caseId: kase.id, details: { commitmentId: commitment.id, text: body.text } });
  res.status(201).json({ commitment });
});

workRouter.patch('/commitments/:id', async (req, res) => {
  const c = await prisma.commitment.findUnique({ where: { id: req.params.id as string } });
  if (!c) throw notFound('Commitment');
  await caseOfEntity(req, c.caseId);
  const body = parseBody(z.object({ text: trimmed(3, 2000).optional(), status: z.enum(['ACTIVE', 'SUPERSEDED', 'DISPUTED']).optional() }), req.body);
  const commitment = await prisma.commitment.update({ where: { id: c.id }, data: body });
  await audit(actorOf(req), 'COMMITMENT_UPDATED', { caseId: c.caseId, details: { commitmentId: c.id, changes: body } });
  res.json({ commitment });
});

// ------------------------------------------------------------- resolution criteria
const CriterionBody = z.object({
  description: trimmed(3, 1000),
  evidenceRequired: trimmed(3, 1000),
  requiresCustomerConfirmation: z.boolean().default(false),
  status: z.enum(CRITERION_STATUSES).default('PENDING'),
  evidenceNote: z.string().max(2000).nullish(),
});

workRouter.post('/cases/:id/criteria', async (req, res) => {
  const kase = await assertCaseAccess(userOf(req), req.params.id as string);
  const body = parseBody(CriterionBody, req.body);
  const criterion = await prisma.resolutionCriterion.create({ data: { ...body, caseId: kase.id } });
  await audit(actorOf(req), 'CRITERION_ADDED', { caseId: kase.id, details: { criterionId: criterion.id, description: body.description } });
  res.status(201).json({ criterion });
});

workRouter.patch('/criteria/:id', async (req, res) => {
  const c = await prisma.resolutionCriterion.findUnique({ where: { id: req.params.id as string } });
  if (!c) throw notFound('Criterion');
  await caseOfEntity(req, c.caseId);
  const body = parseBody(CriterionBody.partial(), req.body);
  // A customer-confirmation criterion cannot be marked MET by staff; only the customer's answer does that.
  if (body.status === 'MET' && (body.requiresCustomerConfirmation ?? c.requiresCustomerConfirmation)) {
    const latest = await prisma.customerConfirmation.findFirst({ where: { caseId: c.caseId }, orderBy: { createdAt: 'desc' } });
    if (latest?.outcome !== 'RESOLVED') throw badRequest('This criterion needs the customer’s confirmation');
  }
  const criterion = await prisma.resolutionCriterion.update({ where: { id: c.id }, data: body });
  await audit(actorOf(req), 'CRITERION_UPDATED', { caseId: c.caseId, details: { criterionId: c.id, changes: body } });
  res.json({ criterion });
});

workRouter.delete('/criteria/:id', async (req, res) => {
  const c = await prisma.resolutionCriterion.findUnique({ where: { id: req.params.id as string } });
  if (!c) throw notFound('Criterion');
  await caseOfEntity(req, c.caseId);
  await prisma.resolutionCriterion.delete({ where: { id: c.id } });
  await audit(actorOf(req), 'CRITERION_DELETED', { caseId: c.caseId, details: { criterionId: c.id, description: c.description } });
  res.json({ ok: true });
});

/** Link for the customer to confirm (or reject) the resolution. Shown to staff to share; nothing is sent automatically. */
workRouter.post('/cases/:id/confirmation-link', async (req, res) => {
  const kase = await assertCaseAccess(userOf(req), req.params.id as string);
  const count = await prisma.resolutionCriterion.count({ where: { caseId: kase.id } });
  if (count === 0) throw badRequest('Define resolution criteria first');
  const link = await issueCustomerToken(kase.id, 'CONFIRMATION', userOf(req).id);
  if (kase.status !== 'CLOSED') await prisma.customerCase.update({ where: { id: kase.id }, data: { status: 'AWAITING_CONFIRMATION' } });
  await audit(actorOf(req), 'CONFIRMATION_LINK_CREATED', { caseId: kase.id, details: { expiresAt: link.expiresAt } });
  res.status(201).json({ url: link.url, expiresAt: link.expiresAt });
});

// ------------------------------------------------------------- relations
workRouter.post('/cases/:id/relations', async (req, res) => {
  const kase = await assertCaseAccess(userOf(req), req.params.id as string);
  const body = parseBody(z.object({ relatedCaseId: z.string(), explanation: z.string().max(2000).nullish() }), req.body);
  const related = await prisma.customerCase.findUnique({ where: { id: body.relatedCaseId } });
  if (!related || related.customerId !== kase.customerId || related.id === kase.id) throw badRequest('Choose another case of the same customer');
  const relation = await prisma.caseRelation.upsert({
    where: { caseId_relatedCaseId: { caseId: kase.id, relatedCaseId: related.id } },
    create: { caseId: kase.id, relatedCaseId: related.id, explanation: body.explanation ?? null, confirmedById: userOf(req).id },
    update: { status: 'CONFIRMED', explanation: body.explanation ?? undefined },
  });
  await audit(actorOf(req), 'REPEAT_LINKED', { caseId: kase.id, details: { relationId: relation.id, relatedCaseId: related.id, manual: true } });
  res.status(201).json({ relation });
});

workRouter.post('/relations/:id/root-cause-task', async (req, res) => {
  const r = await prisma.caseRelation.findUnique({ where: { id: req.params.id as string }, include: { relatedCase: true } });
  if (!r || r.status !== 'CONFIRMED') throw notFound('Confirmed relation');
  await caseOfEntity(req, r.caseId);
  const body = parseBody(z.object({ title: trimmed(3, 300).optional(), assigneeId: z.string().nullish(), dueDate: optionalDate }), req.body ?? {});
  const occurrences = 1 + (await prisma.caseRelation.count({ where: { caseId: r.caseId, status: 'CONFIRMED' } }));
  const task = await prisma.task.create({
    data: {
      caseId: r.caseId,
      title: body.title ?? `Əsas səbəbi araşdır: "${r.relatedCase.title}" problemi təkrarlanır`,
      description: `Problem ${occurrences} dəfə qeydə alınıb. Əvvəlki həll: ${r.relatedCase.closeReason ?? 'qeyd edilməyib'}`,
      assigneeId: body.assigneeId ?? userOf(req).id,
      dueDate: body.dueDate ?? null,
      origin: 'ROOT_CAUSE',
    },
  });
  await audit(actorOf(req), 'ROOT_CAUSE_TASK_CREATED', { caseId: r.caseId, details: { taskId: task.id, relationId: r.id } });
  res.status(201).json({ task });
});
