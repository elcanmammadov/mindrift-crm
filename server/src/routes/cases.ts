import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { actorOf, requireAuth, requireRole, userOf } from '../auth/session.js';
import { assertCaseAccess, assertCustomerAccess, caseScope } from '../auth/access.js';
import { CASE_STATUSES, SALES_OUTCOMES } from '../domain/enums.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, forbidden } from '../lib/http.js';
import { parseJson } from '../lib/json.js';
import { serializeFinding, serializeHandover, serializeRun } from '../lib/serialize.js';
import { parseBody, trimmed } from '../lib/validate.js';
import { analyzeCase, runModule } from '../analysis/engine.js';
import { getClosureState } from '../modules/proofclose.js';
import { aiLimiter } from '../middleware/rateLimit.js';
import { getAiMode } from '../ai/provider.js';

export const casesRouter = Router();
casesRouter.use('/cases', requireAuth);

casesRouter.get('/cases', async (req, res) => {
  const user = userOf(req);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined;
  const cases = await prisma.customerCase.findMany({
    where: {
      AND: [
        caseScope(user),
        status ? { status } : {},
        q ? { OR: [{ title: { contains: q } }, { customer: { name: { contains: q } } }, { initialRequest: { contains: q } }] } : {},
      ],
    },
    include: { customer: { select: { id: true, name: true } }, owner: { select: { id: true, name: true } } },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ cases });
});

const CreateCase = z.object({
  customerId: z.string().min(1),
  title: trimmed(3, 200),
  initialRequest: trimmed(3, 5000),
  coreNeed: z.string().trim().max(5000).nullish(),
  ownerId: z.string().nullish(),
});

casesRouter.post('/cases', async (req, res) => {
  const user = userOf(req);
  const body = parseBody(CreateCase, req.body);
  await assertCustomerAccess(user, body.customerId);
  // Agents can only create cases for themselves; admins may assign.
  const ownerId = user.role === 'ADMIN' ? (body.ownerId ?? user.id) : user.id;
  const kase = await prisma.customerCase.create({
    data: { customerId: body.customerId, title: body.title, initialRequest: body.initialRequest, coreNeed: body.coreNeed ?? null, ownerId },
  });
  await audit(actorOf(req), 'CASE_CREATED', { caseId: kase.id, customerId: body.customerId, details: { title: kase.title } });
  res.status(201).json({ case: kase });
});

/** Everything the case detail screen needs in one request. */
casesRouter.get('/cases/:id', async (req, res) => {
  const user = userOf(req);
  await assertCaseAccess(user, req.params.id as string);
  const id = req.params.id;
  const [kase, sources, findings, blockers, tasks, handovers, criteria, confirmations, relFrom, relTo, loss, runs, commitments, requirements, audits, closure, aiMode] =
    await Promise.all([
      prisma.customerCase.findUniqueOrThrow({
        where: { id },
        include: { customer: true, owner: { select: { id: true, name: true, email: true } } },
      }),
      prisma.source.findMany({ where: { caseId: id, deletedAt: null }, orderBy: { occurredAt: 'asc' } }),
      prisma.finding.findMany({ where: { caseId: id }, include: { evidence: { include: { source: true } } }, orderBy: { createdAt: 'asc' } }),
      prisma.blocker.findMany({ where: { caseId: id }, include: { owner: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } }),
      prisma.task.findMany({ where: { caseId: id }, include: { assignee: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } }),
      prisma.handover.findMany({
        where: { caseId: id },
        include: { fromUser: { select: { id: true, name: true } }, toUser: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.resolutionCriterion.findMany({ where: { caseId: id }, orderBy: { createdAt: 'asc' } }),
      prisma.customerConfirmation.findMany({ where: { caseId: id }, orderBy: { createdAt: 'desc' } }),
      prisma.caseRelation.findMany({ where: { caseId: id }, include: { relatedCase: { select: { id: true, title: true, status: true, closeReason: true, createdAt: true } } } }),
      prisma.caseRelation.findMany({ where: { relatedCaseId: id }, include: { case: { select: { id: true, title: true, status: true, closeReason: true, createdAt: true } } } }),
      prisma.lossAnalysis.findUnique({ where: { caseId: id } }),
      prisma.analysisRun.findMany({ where: { caseId: id }, orderBy: { startedAt: 'desc' }, take: 40 }),
      prisma.commitment.findMany({ where: { caseId: id }, orderBy: { createdAt: 'asc' } }),
      prisma.requirement.findMany({ where: { caseId: id }, orderBy: { createdAt: 'asc' } }),
      prisma.auditEvent.findMany({ where: { caseId: id }, orderBy: { createdAt: 'desc' }, take: 100 }),
      getClosureState(id),
      getAiMode(),
    ]);

  // Customer's other cases (titles only) so the repeat-problem view can name them.
  const otherCases = await prisma.customerCase.findMany({
    where: { customerId: kase.customerId, id: { not: id } },
    select: { id: true, title: true, status: true, createdAt: true, closeReason: true },
  });

  const latestRunByModule: Record<string, ReturnType<typeof serializeRun>> = {};
  for (const r of runs) {
    const m = parseJson<string[]>(r.modules, [])[0];
    if (m && !latestRunByModule[m]) latestRunByModule[m] = serializeRun(r);
  }

  res.json({
    case: kase,
    analysisOutdated: kase.analyzedRevision === null ? sources.length > 0 : kase.analyzedRevision < kase.sourcesRevision,
    aiMode,
    sources,
    findings: findings.map(serializeFinding),
    blockers,
    tasks,
    handovers: handovers.map(serializeHandover),
    criteria,
    confirmations,
    relations: [
      ...relFrom.map((r) => ({ id: r.id, status: r.status, explanation: r.explanation, other: r.relatedCase, createdAt: r.createdAt })),
      ...relTo.map((r) => ({ id: r.id, status: r.status, explanation: r.explanation, other: r.case, createdAt: r.createdAt })),
    ],
    otherCases,
    lossAnalysis: loss,
    runs: runs.map(serializeRun),
    latestRunByModule,
    commitments,
    requirements,
    audit: audits.map((a) => ({ ...a, details: parseJson(a.details, {}) })),
    closure,
  });
});

const PatchCase = z.object({
  title: trimmed(3, 200).optional(),
  initialRequest: trimmed(3, 5000).optional(),
  coreNeed: z.string().trim().max(5000).nullish(),
  status: z.enum(CASE_STATUSES).optional(),
  salesOutcome: z.enum(SALES_OUTCOMES).optional(),
  ownerId: z.string().nullish(),
});

casesRouter.patch('/cases/:id', async (req, res) => {
  const user = userOf(req);
  const current = await assertCaseAccess(user, req.params.id as string);
  const body = parseBody(PatchCase, req.body);

  if (body.ownerId !== undefined && body.ownerId !== current.ownerId && user.role !== 'ADMIN') {
    throw forbidden('Ownership changes go through a handover');
  }
  if (body.status === 'CLOSED' && current.status !== 'CLOSED') {
    const closure = await getClosureState(current.id);
    if (!closure.canClose) {
      throw conflict('CLOSE_BLOCKED', 'The case cannot be closed yet', { blockingReasons: closure.blockingReasons });
    }
  }
  if (body.salesOutcome === 'LOST' && current.salesOutcome !== 'LOST') {
    const loss = await prisma.lossAnalysis.findUnique({ where: { caseId: current.id } });
    if (!loss) throw conflict('LOSS_REASON_REQUIRED', 'Record a loss reason first (PUT /cases/:id/loss)');
  }

  const kase = await prisma.customerCase.update({
    where: { id: current.id },
    data: {
      ...body,
      ...(body.status === 'CLOSED' && current.status !== 'CLOSED' ? { closedAt: new Date(), closedManually: false, closeReason: null } : {}),
      ...(body.status && body.status !== 'CLOSED' && current.status === 'CLOSED' ? { closedAt: null, closedManually: false } : {}),
    },
  });
  const changes: Record<string, unknown> = {};
  for (const k of Object.keys(body) as (keyof typeof body)[]) {
    if (body[k] !== undefined && body[k] !== (current as Record<string, unknown>)[k]) changes[k] = { from: (current as Record<string, unknown>)[k], to: body[k] };
  }
  if (Object.keys(changes).length) await audit(actorOf(req), 'CASE_UPDATED', { caseId: kase.id, details: changes });
  res.json({ case: kase });
});

/** Admin override: closes the case with a reason. Recorded as a manual close, never as customer confirmation. */
casesRouter.post('/cases/:id/manual-close', requireRole('ADMIN'), async (req, res) => {
  const user = userOf(req);
  const current = await assertCaseAccess(user, req.params.id as string);
  const body = parseBody(z.object({ reason: trimmed(5, 2000) }), req.body);
  const closure = await getClosureState(current.id);
  const kase = await prisma.customerCase.update({
    where: { id: current.id },
    data: { status: 'CLOSED', closedAt: new Date(), closedManually: true, closeReason: body.reason },
  });
  await audit(actorOf(req), 'CASE_CLOSED_MANUALLY', {
    caseId: kase.id,
    details: { reason: body.reason, blockingReasonsAtClose: closure.blockingReasons, note: 'Not a customer confirmation' },
  });
  res.json({ case: kase });
});

casesRouter.post('/cases/:id/analyze', aiLimiter, async (req, res) => {
  const user = userOf(req);
  const current = await assertCaseAccess(user, req.params.id as string);
  const body = parseBody(z.object({ force: z.boolean().optional() }), req.body ?? {});
  const sourceCount = await prisma.source.count({ where: { caseId: current.id, deletedAt: null } });
  if (sourceCount === 0) throw badRequest('Add at least one source before analysing');
  const results = await analyzeCase(current.id, actorOf(req), { force: body.force });
  res.json({ results });
});

casesRouter.post('/cases/:id/evaluate-resolution', aiLimiter, async (req, res) => {
  const user = userOf(req);
  const current = await assertCaseAccess(user, req.params.id as string);
  const count = await prisma.resolutionCriterion.count({ where: { caseId: current.id } });
  if (count === 0) throw badRequest('Define at least one resolution criterion first');
  const result = await runModule(current.id, 'PROOFCLOSE', actorOf(req), { force: false });
  res.json({ result, closure: await getClosureState(current.id) });
});
