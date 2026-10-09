import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { setProviderOverride } from '../src/ai/provider.js';
import { MockProvider } from '../src/ai/mock.js';
import { runModule, analyzeCase } from '../src/analysis/engine.js';
import { createSource } from '../src/modules/sources.js';
import { caseByTitle, login, resetDemo } from './helpers.js';

const SYSTEM = { type: 'SYSTEM' as const, name: 'test' };

const blockerOutput = (title: string) =>
  JSON.stringify({
    findings: [
      {
        kind: 'BLOCKER',
        title,
        explanation: 'Müştərinin köçürmə sualı cavabsızdır.',
        epistemic: 'OBSERVED',
        strength: 'STRONG',
        evidence: [{ sourceRef: 'S4', quote: 'Köhnə Excel bazasındakı məhsul və müştəri məlumatlarını yeni sistemə siz köçürəcəksiniz' }],
        data: { category: 'DATA_MIGRATION', nextStep: 'Cavab vermək', resolutionCriteria: 'Müştəri təsdiqləyir', suggestedDueDays: 2 },
        en: { title: 'Migration question unanswered', explanation: '...' },
      },
    ],
    missingInformation: [],
  });

describe('analysis engine: re-analysis does not duplicate results', () => {
  beforeAll(async () => {
    await resetDemo();
  });
  afterEach(() => setProviderOverride(null));

  it('skips the model call when inputs are unchanged and never duplicates findings or blockers', async () => {
    const kase = await caseByTitle('Onlayn mağaza saytı');
    const mock = new MockProvider(() => blockerOutput('Köçürmə sualı cavabsızdır'));
    setProviderOverride(mock);

    const first = await runModule(kase.id, 'UNBLOCK', SYSTEM);
    expect(first.status).toBe('SUCCEEDED');
    expect(first.origin).toBe('MOCK');
    const countAfterFirst = await prisma.finding.count({ where: { caseId: kase.id, module: 'UNBLOCK' } });

    const second = await runModule(kase.id, 'UNBLOCK', SYSTEM);
    expect(second.status).toBe('UNCHANGED');
    expect(mock.calls).toHaveLength(1);

    // Forced re-run with different wording for the same evidence: matched, not duplicated.
    setProviderOverride(new MockProvider(() => blockerOutput('Məlumat köçürülməsi sualına cavab verilməyib')));
    const third = await runModule(kase.id, 'UNBLOCK', SYSTEM, { force: true });
    expect(third.status).toBe('SUCCEEDED');
    expect(await prisma.finding.count({ where: { caseId: kase.id, module: 'UNBLOCK' } })).toBe(countAfterFirst);

    // Accepting the same suggestion twice cannot create two blockers.
    const agent = await login('nihat@mindrift.az');
    const f = await prisma.finding.findFirstOrThrow({ where: { caseId: kase.id, module: 'UNBLOCK', kind: 'BLOCKER', stale: false } });
    expect((await agent.post(`/api/findings/${f.id}/to-blocker`)).status).toBe(201);
    expect((await agent.post(`/api/findings/${f.id}/to-blocker`)).status).toBe(409);
    expect(await prisma.blocker.count({ where: { findingId: f.id } })).toBe(1);
  });

  it('keeps human decisions when the AI re-analyses', async () => {
    const kase = await caseByTitle('Onlayn mağaza saytı');
    const f = await prisma.finding.findFirstOrThrow({ where: { caseId: kase.id, module: 'ONEVOICE', kind: 'CONTRADICTION' } });
    const agent = await login('nihat@mindrift.az');
    await agent.post(`/api/findings/${f.id}/review`, { status: 'REJECTED', note: 'Rəhbərlik pulsuz verməyə razıdır' });

    setProviderOverride(
      new MockProvider(() =>
        JSON.stringify({
          findings: [
            {
              existingFindingId: f.id,
              kind: 'CONTRADICTION',
              title: 'Yeni ifadə',
              explanation: 'AI başqa sözlə yazdı',
              epistemic: 'OBSERVED',
              strength: 'STRONG',
              evidence: [
                { sourceRef: 'S3', quote: 'WhatsApp inteqrasiyası pulsuz olacaq', label: 'A' },
                { sourceRef: 'S5', quote: 'WhatsApp inteqrasiyası — 150 AZN', label: 'B' },
              ],
              data: { topic: 'PRICE', effectiveStatus: 'CONFLICT' },
            },
          ],
          missingInformation: [],
        }),
      ),
    );
    const r = await runModule(kase.id, 'ONEVOICE', SYSTEM, { force: true });
    expect(r.stats?.kept).toBe(1);
    const after = await prisma.finding.findUniqueOrThrow({ where: { id: f.id } });
    expect(after.reviewStatus).toBe('REJECTED');
    expect(after.title).toBe(f.title);
  });

  it('marks results outdated when sources change and reports invalid JSON as a retryable failure', async () => {
    const kase = await caseByTitle('Onlayn mağaza saytı');
    await createSource(kase.id, { type: 'EMAIL', title: 'Yeni', author: 'Rəşad', authorSide: 'CUSTOMER', occurredAt: new Date(), content: 'Yeni məlumat əlavə edirik.' }, SYSTEM);
    const agent = await login('nihat@mindrift.az');
    const detail = await agent.get(`/api/cases/${kase.id}`);
    expect(detail.body.analysisOutdated).toBe(true);

    const bad = new MockProvider(() => 'Bu JSON deyil {');
    setProviderOverride(bad);
    const before = await prisma.finding.count({ where: { caseId: kase.id } });
    const r = await runModule(kase.id, 'BRIDGE', SYSTEM);
    expect(r.status).toBe('FAILED');
    expect(r.error).toMatchObject({ code: 'INVALID_JSON', retryable: true });
    expect(bad.calls).toHaveLength(2); // one repair attempt
    expect(await prisma.finding.count({ where: { caseId: kase.id } })).toBe(before);
  });

  it('demo mode: prepared results are reused, unknown data gets limited rule-based analysis', async () => {
    await resetDemo();
    const kase = await caseByTitle('Onlayn mağaza saytı');
    const res = await analyzeCase(kase.id, SYSTEM);
    expect(res.every((r) => r.status === 'UNCHANGED')).toBe(true);

    const fresh = await caseByTitle('Kassa proqramı dəstəyi');
    const res2 = await analyzeCase(fresh.id, SYSTEM);
    expect(res2.every((r) => r.status === 'SUCCEEDED' && r.origin === 'RULES')).toBe(true);
  });

  it('demo mode: rule-based re-analysis never overwrites or outdates prepared results', async () => {
    await resetDemo();
    const kase = await caseByTitle('Onlayn mağaza saytı');
    const before = await prisma.finding.findMany({ where: { caseId: kase.id, origin: 'DEMO_PREPARED' } });
    await createSource(kase.id, { type: 'EMAIL', title: 'Yeni sual', author: 'Rəşad', authorSide: 'CUSTOMER', occurredAt: new Date(), content: 'Təhlükəsizlik sertifikatınız varmı?' }, SYSTEM);
    const res = await analyzeCase(kase.id, SYSTEM);
    expect(res.every((r) => r.status === 'SUCCEEDED' && r.origin === 'RULES')).toBe(true);
    const after = await prisma.finding.findMany({ where: { id: { in: before.map((f) => f.id) } } });
    for (const f of after) {
      const prev = before.find((b) => b.id === f.id)!;
      expect(f.stale).toBe(false);
      expect(f.origin).toBe('DEMO_PREPARED');
      expect(f.title).toBe(prev.title);
    }
    // The new, unknown question is picked up by the rule engine and labelled as rules output.
    const rules = await prisma.finding.findMany({ where: { caseId: kase.id, module: 'UNBLOCK', origin: 'RULES' } });
    expect(rules.some((f) => f.title.includes('Təhlükəsizlik'))).toBe(true);
  });
});

describe('contradiction analysis respects packages and accepted changes (rules engine)', () => {
  beforeAll(async () => {
    await resetDemo();
  });

  it('an agreed discount with an amended contract is not reported', async () => {
    const kase = await caseByTitle('Onlayn bron modulu');
    const r = await runModule(kase.id, 'ONEVOICE', SYSTEM, { force: true });
    expect(r.origin).toBe('RULES');
    const open = await prisma.finding.count({ where: { caseId: kase.id, module: 'ONEVOICE', stale: false } });
    expect(open).toBe(0);
  });

  it('prices of different packages are not reported', async () => {
    const kase = await caseByTitle('Anbar uçotu proqramı');
    await runModule(kase.id, 'ONEVOICE', SYSTEM, { force: true });
    expect(await prisma.finding.count({ where: { caseId: kase.id, module: 'ONEVOICE', stale: false } })).toBe(0);
  });

  it('"free" vs "150 AZN" for the same package is reported with two verified quotes', async () => {
    const kase = await caseByTitle('Onlayn mağaza saytı');
    await runModule(kase.id, 'ONEVOICE', SYSTEM, { force: true });
    const f = await prisma.finding.findFirstOrThrow({
      where: { caseId: kase.id, module: 'ONEVOICE', kind: 'CONTRADICTION', stale: false },
      include: { evidence: true },
    });
    expect(f.evidence.filter((e) => e.verified).length).toBeGreaterThanOrEqual(2);
  });
});
