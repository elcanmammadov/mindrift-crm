import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { setProviderOverride } from '../src/ai/provider.js';
import { MockProvider } from '../src/ai/mock.js';
import { runModule } from '../src/analysis/engine.js';
import { getClosureState } from '../src/modules/proofclose.js';
import { issueCustomerToken } from '../src/modules/tokens.js';
import { caseByTitle, login, publicApi, resetDemo } from './helpers.js';

describe('a case that needs customer confirmation is never "resolved" without it', () => {
  beforeAll(async () => {
    await resetDemo();
  });

  it('blocks closing even when every staff criterion is met and the AI verdict is positive', async () => {
    const kase = await caseByTitle('Kassa proqramı dəstəyi'); // one criterion, requires customer confirmation
    const ataxan = await login('ataxan@mindrift.az');
    const crit = await prisma.resolutionCriterion.findFirstOrThrow({ where: { caseId: kase.id } });

    // Staff cannot mark a customer-confirmation criterion as met.
    expect((await ataxan.patch(`/api/criteria/${crit.id}`, { status: 'MET' })).status).toBe(400);

    // An (optimistic) AI verdict, even accepted by a human, does not replace the customer.
    setProviderOverride(
      new MockProvider(() =>
        JSON.stringify({
          findings: [
            {
              kind: 'VERDICT',
              title: 'Həll dəstəklənir',
              explanation: 'Sürücü yeniləndi',
              epistemic: 'INFERRED',
              strength: 'MEDIUM',
              evidence: [{ sourceRef: 'S2', quote: 'Printer sürücüsünü yenilədik.' }],
              data: { verdict: 'SUPPORTED', criteria: [{ criterionRef: 'K1', status: 'MET' }] },
            },
          ],
          missingInformation: [],
        }),
      ),
    );
    await runModule(kase.id, 'PROOFCLOSE', { type: 'SYSTEM' });
    setProviderOverride(null);
    const verdict = await prisma.finding.findFirstOrThrow({ where: { caseId: kase.id, module: 'PROOFCLOSE', stale: false } });
    expect((await ataxan.post(`/api/findings/${verdict.id}/apply-verdict`)).status).toBe(200);
    expect((await prisma.resolutionCriterion.findUniqueOrThrow({ where: { id: crit.id } })).status).toBe('PENDING');

    const state = await getClosureState(kase.id);
    expect(state.canClose).toBe(false);
    expect(state.blockingReasons).toContain('CUSTOMER_CONFIRMATION_MISSING');
    expect(state.resolutionState).not.toBe('CUSTOMER_CONFIRMED');

    const close = await ataxan.patch(`/api/cases/${kase.id}`, { status: 'CLOSED' });
    expect(close.status).toBe(409);
    expect(close.body.error.code).toBe('CLOSE_BLOCKED');

    // The customer confirms through their link -> now it can be closed.
    const { token } = await issueCustomerToken(kase.id, 'CONFIRMATION');
    expect((await publicApi.post(`/api/public/${token}/confirm`, { outcome: 'RESOLVED', note: 'Bir həftədir problem yoxdur' })).status).toBe(200);
    const after = await getClosureState(kase.id);
    expect(after.resolutionState).toBe('CUSTOMER_CONFIRMED');
    expect(after.canClose).toBe(true);
    expect((await ataxan.patch(`/api/cases/${kase.id}`, { status: 'CLOSED' })).status).toBe(200);
  });

  it('"problem remains" from the customer reopens the case and blocks closing', async () => {
    const kase = await caseByTitle('Onlayn mağaza saytı');
    const { token } = await issueCustomerToken(kase.id, 'CONFIRMATION');
    await prisma.customerCase.update({ where: { id: kase.id }, data: { status: 'AWAITING_CONFIRMATION' } });
    await publicApi.post(`/api/public/${token}/confirm`, { outcome: 'PROBLEM_REMAINS', note: 'Sifarişlər yenə itir' });
    const k = await prisma.customerCase.findUniqueOrThrow({ where: { id: kase.id } });
    expect(k.status).toBe('REOPENED');
    const state = await getClosureState(kase.id);
    expect(state.resolutionState).toBe('PROBLEM_REMAINS');
    expect(state.blockingReasons).toContain('CUSTOMER_REPORTED_PROBLEM_REMAINS');
  });

  it('admin manual close is audited and never shown as customer confirmation', async () => {
    const kase = await caseByTitle('Onlayn mağaza saytı');
    const admin = await login('elcan@mindrift.az');
    expect((await admin.post(`/api/cases/${kase.id}/manual-close`, { reason: 'Müştəri ilə razılaşma əsasında yeni iş açılır' })).status).toBe(200);
    const state = await getClosureState(kase.id);
    expect(state.resolutionState).toBe('MANUALLY_CLOSED');
    const ev = await prisma.auditEvent.findFirstOrThrow({ where: { caseId: kase.id, action: 'CASE_CLOSED_MANUALLY' } });
    expect(ev.details).toContain('Not a customer confirmation');
  });
});

describe('repeat problems are linked only after human confirmation', () => {
  beforeAll(async () => {
    await resetDemo();
  });

  it('does not auto-link; confirming creates the relation and allows a root-cause task', async () => {
    const kase = await caseByTitle('Sifarişlər yenə itir');
    expect(await prisma.caseRelation.count({ where: { caseId: kase.id } })).toBe(0);
    const casesBefore = await prisma.customerCase.count();

    const ataxan = await login('ataxan@mindrift.az');
    const f = await prisma.finding.findFirstOrThrow({ where: { caseId: kase.id, module: 'LOOP', reviewStatus: 'PENDING' } });
    const link = await ataxan.post(`/api/findings/${f.id}/link-repeat`);
    expect(link.status).toBe(201);
    expect(link.body.relation.status).toBe('CONFIRMED');
    // Linking twice keeps a single relation; cases are never merged or deleted.
    await ataxan.post(`/api/findings/${f.id}/link-repeat`);
    expect(await prisma.caseRelation.count({ where: { caseId: kase.id } })).toBe(1);
    expect(await prisma.customerCase.count()).toBe(casesBefore);

    const task = await ataxan.post(`/api/relations/${link.body.relation.id}/root-cause-task`);
    expect(task.status).toBe(201);
    expect(task.body.task.origin).toBe('ROOT_CAUSE');

    // A rejected suggestion stays rejected and creates nothing.
    const other = await prisma.finding.findFirstOrThrow({ where: { caseId: kase.id, module: 'LOOP', reviewStatus: 'PENDING' } });
    await ataxan.post(`/api/findings/${other.id}/review`, { status: 'REJECTED' });
    expect(await prisma.caseRelation.count({ where: { caseId: kase.id } })).toBe(1);
  });
});
