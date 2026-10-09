import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/db.js';
import { issueCustomerToken } from '../src/modules/tokens.js';
import { app, caseByTitle, login, outsiderAgent, publicApi, resetDemo } from './helpers.js';

describe('roles and case access are enforced on the API', () => {
  beforeAll(async () => {
    await resetDemo();
  });

  it('rejects unauthenticated requests and requests without the CSRF header', async () => {
    expect((await request(app).get('/api/cases')).status).toBe(401);
    const res = await request(app).post('/api/auth/login').send({ email: 'elcan@mindrift.az', password: 'admin1234' });
    expect(res.status).toBe(403);
  });

  it('an agent cannot read or change another agent’s case', async () => {
    const outsider = await login('nihat@mindrift.az');
    const kase = await caseByTitle('Kassa proqramı dəstəyi'); // owned by Ataxan
    expect((await outsider.get(`/api/cases/${kase.id}`)).status).toBe(403);
    expect((await outsider.patch(`/api/cases/${kase.id}`, { title: 'Oğurlanmış iş' })).status).toBe(403);
    expect((await outsider.post(`/api/cases/${kase.id}/sources`, { type: 'EMAIL', title: 't', author: 'a', authorSide: 'CUSTOMER', occurredAt: '2026-10-01', content: 'x' })).status).toBe(403);
    expect((await outsider.post(`/api/cases/${kase.id}/analyze`)).status).toBe(403);
    const list = await outsider.get('/api/cases');
    expect(list.body.cases.map((c: { id: string }) => c.id)).not.toContain(kase.id);
  });

  it('an agent cannot reach another case through nested resources', async () => {
    const outsider = await outsiderAgent();
    const kase = await caseByTitle('Onlayn mağaza saytı'); // Nihat, pending handover to Ataxan
    const source = await prisma.source.findFirstOrThrow({ where: { caseId: kase.id } });
    const finding = await prisma.finding.findFirstOrThrow({ where: { caseId: kase.id } });
    const blocker = await prisma.blocker.findFirstOrThrow({ where: { caseId: kase.id } });
    expect((await outsider.get(`/api/sources/${source.id}`)).status).toBe(403);
    expect((await outsider.post(`/api/findings/${finding.id}/review`, { status: 'CONFIRMED' })).status).toBe(403);
    expect((await outsider.patch(`/api/blockers/${blocker.id}`, { status: 'RESOLVED' })).status).toBe(403);
  });

  it('the receiving agent of a pending handover can open the case; only they can accept it', async () => {
    const kase = await caseByTitle('Onlayn mağaza saytı');
    const handover = await prisma.handover.findFirstOrThrow({ where: { caseId: kase.id, status: 'PENDING' } });
    const ataxan = await login('ataxan@mindrift.az');
    const nihat = await login('nihat@mindrift.az');
    expect((await ataxan.get(`/api/cases/${kase.id}`)).status).toBe(200);
    expect((await nihat.post(`/api/handovers/${handover.id}/accept`)).status).toBe(403);
    const ok = await ataxan.post(`/api/handovers/${handover.id}/accept`);
    expect(ok.status).toBe(200);
    const after = await prisma.customerCase.findUniqueOrThrow({ where: { id: kase.id } });
    expect(after.ownerId).toBe(handover.toUserId);
    const events = await prisma.auditEvent.findMany({ where: { caseId: kase.id, action: 'HANDOVER_ACCEPTED' } });
    expect(events).toHaveLength(1);
    // Previous owner lost access after the handover.
    expect((await nihat.get(`/api/cases/${kase.id}`)).status).toBe(403);
  });

  it('agents cannot use admin-only endpoints', async () => {
    const agent = await login('nihat@mindrift.az');
    const kase = await caseByTitle('Satış komandası üçün CRM');
    expect((await agent.post(`/api/cases/${kase.id}/manual-close`, { reason: 'Test bağlanma' })).status).toBe(403);
    expect((await agent.post('/api/demo/reset')).status).toBe(403);
    expect((await agent.put('/api/settings/ai-mode', { mode: 'REAL' })).status).toBe(403);
  });
});

describe('customer tokens give access to exactly one action on exactly one case', () => {
  beforeAll(async () => {
    await resetDemo();
  });

  it('a confirmation token only exposes its own case and cannot be used for other actions', async () => {
    const a = await caseByTitle('Onlayn mağaza saytı');
    const b = await caseByTitle('Kassa proqramı dəstəyi');
    const { token } = await issueCustomerToken(a.id, 'CONFIRMATION');

    const view = await publicApi.get(`/api/public/${token}`);
    expect(view.status).toBe(200);
    expect(view.body.caseTitle).toBe(a.title);
    expect(JSON.stringify(view.body)).not.toContain(b.title);
    expect(view.body).not.toHaveProperty('sources');

    // Wrong purpose.
    expect((await publicApi.post(`/api/public/${token}/exit/start`, { locale: 'az' })).status).toBe(403);
    // Token is not a staff session.
    expect((await request(app).get(`/api/cases/${b.id}`).set('Cookie', `mr_session=${token}`)).status).toBe(401);
    // Unknown token.
    expect((await publicApi.get('/api/public/not-a-real-token-1234567890')).status).toBe(404);

    // The confirmation lands on case A only, and the link works once.
    expect((await publicApi.post(`/api/public/${token}/confirm`, { outcome: 'PROBLEM_REMAINS', note: 'Yenə itir' })).status).toBe(200);
    expect(await prisma.customerConfirmation.count({ where: { caseId: a.id } })).toBe(1);
    expect(await prisma.customerConfirmation.count({ where: { caseId: b.id } })).toBe(0);
    expect((await publicApi.post(`/api/public/${token}/confirm`, { outcome: 'RESOLVED' })).status).toBe(409);
  });

  it('expired tokens are rejected', async () => {
    const a = await caseByTitle('Kassa proqramı dəstəyi');
    const { token, id } = await issueCustomerToken(a.id, 'EXIT');
    await prisma.customerAccessToken.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await publicApi.get(`/api/public/${token}`)).status).toBe(410);
  });
});
