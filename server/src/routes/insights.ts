import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { actorOf, requireAuth, userOf } from '../auth/session.js';
import { assertCaseAccess, assertCustomerAccess, caseScope, customerScope } from '../auth/access.js';
import { LOSS_REASONS } from '../domain/enums.js';
import { audit } from '../lib/audit.js';
import { notFound } from '../lib/http.js';
import { parseJson } from '../lib/json.js';
import { serializeFinding } from '../lib/serialize.js';
import { parseBody } from '../lib/validate.js';
import { runModule } from '../analysis/engine.js';
import { aiLimiter } from '../middleware/rateLimit.js';

export const insightsRouter = Router();
insightsRouter.use(['/dashboard', '/insights', '/exit-conversations'], requireAuth);

/** All numbers are counted from the database; nothing is estimated or invented. */
insightsRouter.get('/dashboard', async (req, res) => {
  const user = userOf(req);
  const scope = caseScope(user);
  const now = new Date();
  const [openCases, openContradictions, unresolvedBlockers, overdueTasks, pendingHandovers, awaitingConfirmation, confirmedRepeats, repeatSuggestions, lostSales, churned, outdated, myTasks, reviewQueue] =
    await Promise.all([
      prisma.customerCase.count({ where: { ...scope, status: { not: 'CLOSED' } } }),
      prisma.finding.count({ where: { case: scope, module: 'ONEVOICE', stale: false, reviewStatus: { in: ['PENDING', 'CONFIRMED'] } } }),
      prisma.blocker.count({ where: { case: scope, status: { not: 'RESOLVED' } } }),
      prisma.task.count({ where: { case: scope, status: { not: 'DONE' }, dueDate: { lt: now } } }),
      prisma.handover.count({ where: { status: 'PENDING', ...(user.role === 'ADMIN' ? {} : { OR: [{ toUserId: user.id }, { fromUserId: user.id }] }) } }),
      prisma.customerCase.count({ where: { ...scope, status: 'AWAITING_CONFIRMATION' } }),
      prisma.caseRelation.count({ where: { case: scope, status: 'CONFIRMED' } }),
      prisma.finding.count({ where: { case: scope, module: 'LOOP', stale: false, reviewStatus: 'PENDING' } }),
      prisma.customerCase.count({ where: { ...scope, salesOutcome: 'LOST' } }),
      prisma.customer.count({ where: { AND: [customerScope(user), { status: 'CHURNED' }] } }),
      prisma.customerCase.findMany({
        where: { ...scope, status: { not: 'CLOSED' } },
        select: { id: true, title: true, sourcesRevision: true, analyzedRevision: true, customer: { select: { name: true } } },
      }),
      prisma.task.findMany({
        where: { assigneeId: user.id, status: { not: 'DONE' } },
        include: { case: { select: { id: true, title: true } } },
        orderBy: { dueDate: 'asc' },
        take: 8,
      }),
      prisma.finding.findMany({
        where: { case: scope, stale: false, reviewStatus: 'PENDING', module: { in: ['ONEVOICE', 'UNBLOCK', 'LOOP'] } },
        include: { case: { select: { id: true, title: true } } },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ]);
  res.json({
    metrics: {
      openCases,
      openContradictions,
      unresolvedBlockers,
      overdueTasks,
      pendingHandovers,
      awaitingConfirmation,
      repeatProblems: { confirmed: confirmedRepeats, suggested: repeatSuggestions },
      lostSales,
      churnedCustomers: churned,
    },
    outdatedAnalyses: outdated.filter((c) => c.analyzedRevision !== null && c.analyzedRevision < c.sourcesRevision),
    myTasks,
    reviewQueue: reviewQueue.map((f) => ({ ...f, data: undefined, translations: parseJson(f.translations, {}) })),
  });
});

// ------------------------------------------------------------- WhyLost
insightsRouter.put('/cases/:id/loss', requireAuth, async (req, res) => {
  const user = userOf(req);
  const kase = await assertCaseAccess(user, req.params.id as string);
  const body = parseBody(z.object({ agentReason: z.enum(LOSS_REASONS), agentNote: z.string().trim().max(2000).nullish() }), req.body);
  const loss = await prisma.lossAnalysis.upsert({
    where: { caseId: kase.id },
    create: { caseId: kase.id, agentReason: body.agentReason, agentNote: body.agentNote ?? null, createdById: user.id },
    update: { agentReason: body.agentReason, agentNote: body.agentNote ?? null },
  });
  await prisma.customerCase.update({ where: { id: kase.id }, data: { salesOutcome: 'LOST' } });
  await audit(actorOf(req), 'SALE_MARKED_LOST', { caseId: kase.id, details: { reason: body.agentReason, note: body.agentNote } });
  res.json({ lossAnalysis: loss });
});

insightsRouter.post('/cases/:id/loss/analyze', requireAuth, aiLimiter, async (req, res) => {
  const kase = await assertCaseAccess(userOf(req), req.params.id as string);
  const result = await runModule(kase.id, 'WHYLOST', actorOf(req));
  res.json({ result });
});

/** Lost deals and churned customers with their analyses, for the insights screen. */
insightsRouter.get('/insights', async (req, res) => {
  const user = userOf(req);
  const lost = await prisma.customerCase.findMany({
    where: { ...caseScope(user), salesOutcome: 'LOST' },
    include: {
      customer: { select: { id: true, name: true } },
      lossAnalysis: true,
      findings: { where: { module: 'WHYLOST', stale: false }, include: { evidence: { include: { source: true } } } },
    },
    orderBy: { updatedAt: 'desc' },
  });
  const churned = await prisma.customer.findMany({
    where: { AND: [customerScope(user), { OR: [{ status: 'CHURNED' }, { exitConversations: { some: {} } }] }] },
    include: { exitConversations: { orderBy: { createdAt: 'desc' }, include: { consent: true } }, cases: { select: { id: true, title: true } } },
  });
  const reasonCounts: Record<string, number> = {};
  for (const c of lost) if (c.lossAnalysis) reasonCounts[c.lossAnalysis.agentReason] = (reasonCounts[c.lossAnalysis.agentReason] ?? 0) + 1;
  res.json({
    lost: lost.map((c) => ({ ...c, findings: c.findings.map(serializeFinding) })),
    reasonCounts,
    churned: churned.map((c) => ({
      ...c,
      exitConversations: c.exitConversations.map((e) => ({
        ...e,
        messages: parseJson(e.messages, []),
        statedReasons: parseJson(e.statedReasons, []),
        summary: parseJson(e.summary, null),
      })),
    })),
  });
});

insightsRouter.get('/exit-conversations/:id', async (req, res) => {
  const conv = await prisma.exitConversation.findUnique({ where: { id: req.params.id as string }, include: { consent: true } });
  if (!conv) throw notFound('Conversation');
  await assertCustomerAccess(userOf(req), conv.customerId);
  res.json({
    conversation: { ...conv, messages: parseJson(conv.messages, []), statedReasons: parseJson(conv.statedReasons, []), summary: parseJson(conv.summary, null) },
  });
});
