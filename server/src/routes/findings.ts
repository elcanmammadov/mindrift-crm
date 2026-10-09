import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { actorOf, requireAuth, userOf } from '../auth/session.js';
import { assertCaseAccess } from '../auth/access.js';
import { BLOCKER_CATEGORIES, REVIEW_STATUSES } from '../domain/enums.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, notFound } from '../lib/http.js';
import { parseJson } from '../lib/json.js';
import { serializeFinding } from '../lib/serialize.js';
import { optionalDate, parseBody, trimmed } from '../lib/validate.js';

export const findingsRouter = Router();
findingsRouter.use('/findings', requireAuth);

async function loadFinding(req: Parameters<typeof userOf>[0]) {
  const finding = await prisma.finding.findUnique({ where: { id: req.params.id as string }, include: { evidence: true } });
  if (!finding) throw notFound('Finding');
  await assertCaseAccess(userOf(req), finding.caseId);
  return finding;
}

/** Human decision on an AI / rule result. This is the only way a finding changes status. */
findingsRouter.post('/findings/:id/review', async (req, res) => {
  const f = await loadFinding(req);
  const body = parseBody(z.object({ status: z.enum(REVIEW_STATUSES), note: z.string().max(2000).nullish() }), req.body);
  const updated = await prisma.finding.update({
    where: { id: f.id },
    data: { reviewStatus: body.status, reviewNote: body.note ?? null, reviewedById: userOf(req).id, reviewedAt: new Date() },
    include: { evidence: { include: { source: true } } },
  });
  await audit(actorOf(req), 'FINDING_REVIEWED', {
    caseId: f.caseId,
    details: { findingId: f.id, module: f.module, kind: f.kind, from: f.reviewStatus, to: body.status, note: body.note },
  });
  res.json({ finding: serializeFinding(updated) });
});

/** UNBLOCK: accept an AI-suggested blocker. findingId is unique on Blocker, so re-accepting never duplicates. */
findingsRouter.post('/findings/:id/to-blocker', async (req, res) => {
  const f = await loadFinding(req);
  if (f.module !== 'UNBLOCK' || f.kind !== 'BLOCKER') throw badRequest('Only blocker suggestions can be turned into blockers');
  const existing = await prisma.blocker.findUnique({ where: { findingId: f.id } });
  if (existing) throw conflict('ALREADY_CREATED', 'A blocker was already created from this finding', { blockerId: existing.id });
  const data = parseJson<{ category?: string; nextStep?: string; resolutionCriteria?: string; suggestedDueDays?: number }>(f.data, {});
  const body = parseBody(
    z.object({
      title: trimmed(3, 300).optional(),
      category: z.enum(BLOCKER_CATEGORIES).optional(),
      ownerId: z.string().nullish(),
      nextStep: z.string().max(2000).nullish(),
      dueDate: optionalDate,
      resolutionCriteria: z.string().max(2000).nullish(),
    }),
    req.body ?? {},
  );
  const ev = f.evidence.find((e) => e.verified);
  const due = body.dueDate ?? (data.suggestedDueDays !== undefined ? new Date(Date.now() + data.suggestedDueDays * 864e5) : null);
  const blocker = await prisma.$transaction(async (tx) => {
    const b = await tx.blocker.create({
      data: {
        caseId: f.caseId,
        findingId: f.id,
        title: body.title ?? f.title,
        description: f.explanation,
        category: body.category ?? (BLOCKER_CATEGORIES as readonly string[]).find((c) => c === data.category) ?? 'OTHER',
        ownerId: body.ownerId ?? userOf(req).id,
        nextStep: body.nextStep ?? data.nextStep ?? null,
        resolutionCriteria: body.resolutionCriteria ?? data.resolutionCriteria ?? null,
        dueDate: due,
        sourceId: ev?.sourceId ?? null,
        evidenceQuote: ev?.quote ?? null,
      },
    });
    await tx.finding.update({ where: { id: f.id }, data: { reviewStatus: 'CONFIRMED', reviewedById: userOf(req).id, reviewedAt: new Date() } });
    return b;
  });
  await audit(actorOf(req), 'BLOCKER_CREATED_FROM_FINDING', { caseId: f.caseId, details: { blockerId: blocker.id, findingId: f.id } });
  res.status(201).json({ blocker });
});

/** UNBLOCK: a human confirms the AI suggestion that a blocker is resolved. */
findingsRouter.post('/findings/:id/apply-resolution', async (req, res) => {
  const f = await loadFinding(req);
  if (f.kind !== 'BLOCKER_RESOLUTION') throw badRequest('Not a blocker-resolution suggestion');
  const { blockerId } = parseJson<{ blockerId?: string }>(f.data, {});
  const blocker = blockerId ? await prisma.blocker.findFirst({ where: { id: blockerId, caseId: f.caseId } }) : null;
  if (!blocker) throw notFound('Blocker');
  await prisma.$transaction([
    prisma.blocker.update({ where: { id: blocker.id }, data: { status: 'RESOLVED', resolvedAt: new Date() } }),
    prisma.finding.update({ where: { id: f.id }, data: { reviewStatus: 'CONFIRMED', reviewedById: userOf(req).id, reviewedAt: new Date() } }),
  ]);
  await audit(actorOf(req), 'BLOCKER_RESOLVED', { caseId: f.caseId, details: { blockerId: blocker.id, viaFinding: f.id } });
  res.json({ ok: true });
});

/** BRIDGE: store a confirmed need as a requirement. */
findingsRouter.post('/findings/:id/to-requirement', async (req, res) => {
  const f = await loadFinding(req);
  const kinds: Record<string, string> = {
    EXPLICIT_REQUEST: 'EXPLICIT_REQUEST',
    CORE_PROBLEM: 'CORE_PROBLEM',
    SUCCESS_CRITERION: 'SUCCESS_CRITERION',
    CONSTRAINT: 'CONSTRAINT',
    QUESTION_TO_ASK: 'OPEN_QUESTION',
  };
  if (f.module !== 'BRIDGE' || !kinds[f.kind]) throw badRequest('Only need-related findings can become requirements');
  const exists = await prisma.requirement.findFirst({ where: { findingId: f.id } });
  if (exists) throw conflict('ALREADY_CREATED', 'Requirement already exists');
  const requirement = await prisma.requirement.create({
    data: { caseId: f.caseId, findingId: f.id, kind: kinds[f.kind]!, text: f.title, epistemic: f.epistemic === 'OBSERVED' ? 'STATED' : 'INFERRED' },
  });
  await prisma.finding.update({ where: { id: f.id }, data: { reviewStatus: 'CONFIRMED', reviewedById: userOf(req).id, reviewedAt: new Date() } });
  await audit(actorOf(req), 'REQUIREMENT_ADDED', { caseId: f.caseId, details: { requirementId: requirement.id, findingId: f.id } });
  res.status(201).json({ requirement });
});

/** Any finding -> task (e.g. clarify a contradiction, process improvement from loss analysis). */
findingsRouter.post('/findings/:id/to-task', async (req, res) => {
  const f = await loadFinding(req);
  const body = parseBody(
    z.object({ title: trimmed(3, 300).optional(), assigneeId: z.string().nullish(), dueDate: optionalDate, description: z.string().max(4000).nullish() }),
    req.body ?? {},
  );
  const exists = await prisma.task.findFirst({ where: { findingId: f.id } });
  if (exists) throw conflict('ALREADY_CREATED', 'A task was already created from this finding', { taskId: exists.id });
  const data = parseJson<{ taskTitle?: string }>(f.data, {});
  const task = await prisma.task.create({
    data: {
      caseId: f.caseId,
      findingId: f.id,
      title: body.title ?? data.taskTitle ?? f.suggestedAction ?? f.title,
      description: body.description ?? f.explanation,
      assigneeId: body.assigneeId ?? userOf(req).id,
      dueDate: body.dueDate ?? null,
      origin: f.module === 'WHYLOST' || f.module === 'EXITLENS' ? 'PROCESS_IMPROVEMENT' : 'FINDING',
    },
  });
  await audit(actorOf(req), 'TASK_CREATED_FROM_FINDING', { caseId: f.caseId, details: { taskId: task.id, findingId: f.id } });
  res.status(201).json({ task });
});

/** LOOP: a human confirms a repeated problem; creates the case relation (cases are never merged or deleted). */
findingsRouter.post('/findings/:id/link-repeat', async (req, res) => {
  const f = await loadFinding(req);
  if (f.module !== 'LOOP') throw badRequest('Only repeat-problem findings can be linked');
  const data = parseJson<{ relatedCaseId?: string }>(f.data, {});
  const related = data.relatedCaseId ? await prisma.customerCase.findUnique({ where: { id: data.relatedCaseId } }) : null;
  if (!related) throw notFound('Related case');
  const kase = await prisma.customerCase.findUniqueOrThrow({ where: { id: f.caseId } });
  if (related.customerId !== kase.customerId) throw badRequest('Cases belong to different customers');
  const relation = await prisma.caseRelation.upsert({
    where: { caseId_relatedCaseId: { caseId: f.caseId, relatedCaseId: related.id } },
    create: { caseId: f.caseId, relatedCaseId: related.id, status: 'CONFIRMED', explanation: f.explanation, findingId: f.id, confirmedById: userOf(req).id },
    update: { status: 'CONFIRMED', confirmedById: userOf(req).id },
  });
  await prisma.finding.update({ where: { id: f.id }, data: { reviewStatus: 'CONFIRMED', reviewedById: userOf(req).id, reviewedAt: new Date() } });
  await audit(actorOf(req), 'REPEAT_LINKED', { caseId: f.caseId, details: { relationId: relation.id, relatedCaseId: related.id, findingId: f.id } });
  res.status(201).json({ relation });
});

/** PROOFCLOSE: a human accepts the evaluation and copies its per-criterion suggestions. */
findingsRouter.post('/findings/:id/apply-verdict', async (req, res) => {
  const f = await loadFinding(req);
  if (f.module !== 'PROOFCLOSE') throw badRequest('Not an evaluation result');
  const data = parseJson<{ criteria?: { criterionId?: string; status?: string; note?: string }[] }>(f.data, {});
  const criteria = await prisma.resolutionCriterion.findMany({ where: { caseId: f.caseId } });
  const ops = [];
  for (const c of data.criteria ?? []) {
    const crit = criteria.find((k) => k.id === c.criterionId);
    if (!crit || !c.status) continue;
    // Customer-confirmation criteria are only changed by the customer's own answer.
    if (crit.requiresCustomerConfirmation) continue;
    ops.push(prisma.resolutionCriterion.update({ where: { id: crit.id }, data: { status: c.status, evidenceNote: c.note ?? crit.evidenceNote } }));
  }
  ops.push(prisma.finding.update({ where: { id: f.id }, data: { reviewStatus: 'CONFIRMED', reviewedById: userOf(req).id, reviewedAt: new Date() } }));
  await prisma.$transaction(ops);
  await audit(actorOf(req), 'RESOLUTION_EVALUATION_ACCEPTED', { caseId: f.caseId, details: { findingId: f.id } });
  res.json({ ok: true });
});
