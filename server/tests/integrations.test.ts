import { createHmac } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/db.js';
import { app, caseByTitle, login, outsiderAgent, resetDemo } from './helpers.js';

const waPayload = (id: string, from: string, text: string) => ({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ value: { contacts: [{ wa_id: from, profile: { name: 'Rəşad' } }], messages: [{ id, from, timestamp: '1760000000', type: 'text', text: { body: text } }] } }] }],
});
const sign = (body: string) => `sha256=${createHmac('sha256', 'app-secret').update(body).digest('hex')}`;

describe('messaging integrations: webhooks land in the inbox, people attach them to cases', () => {
  beforeAll(async () => {
    await resetDemo();
    await prisma.inboundMessage.deleteMany();
    const admin = await login('elcan@mindrift.az');
    const put = await admin.put('/api/integrations/whatsapp', {
      enabled: true,
      config: { phoneNumberId: '123', accessToken: 'token-abcd', verifyToken: 'verify-me', appSecret: 'app-secret' },
    });
    expect(put.status).toBe(200);
  });

  it('only admins configure integrations, secrets are never returned, and incomplete setups cannot be enabled', async () => {
    const agent = await login('nihat@mindrift.az');
    expect((await agent.put('/api/integrations/telegram', { enabled: false, config: { botToken: 'x' } })).status).toBe(403);
    const list = await agent.get('/api/integrations');
    const wa = list.body.integrations.find((i: { provider: string }) => i.provider === 'WHATSAPP');
    expect(wa.enabled).toBe(true);
    expect(JSON.stringify(list.body)).not.toContain('token-abcd');
    expect(wa.config.accessToken).toBe('••••abcd');
    const admin = await login('elcan@mindrift.az');
    expect((await admin.put('/api/integrations/telegram', { enabled: true, config: {} })).status).toBe(400);
  });

  it('answers Meta’s verification handshake only with the right verify token', async () => {
    const ok = await request(app).get('/api/webhooks/whatsapp').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-me', 'hub.challenge': '42' });
    expect(ok.status).toBe(200);
    expect(ok.text).toBe('42');
    expect((await request(app).get('/api/webhooks/whatsapp').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '42' })).status).toBe(403);
  });

  it('rejects unsigned webhooks; stores signed ones once and suggests the customer’s open case by phone', async () => {
    const body = JSON.stringify(waPayload('wamid.1', '994500000001', 'Sifarişlər yenə itir!'));
    const post = (sig?: string) => {
      const r = request(app).post('/api/webhooks/whatsapp').set('Content-Type', 'application/json');
      return (sig ? r.set('X-Hub-Signature-256', sig) : r).send(body);
    };
    expect((await post()).status).toBe(401);
    expect((await post(sign(body))).status).toBe(200);
    expect((await post(sign(body))).status).toBe(200); // Meta retry: no duplicate
    const msgs = await prisma.inboundMessage.findMany({ where: { provider: 'WHATSAPP' } });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.fromId).toBe('+994500000001');
    const suggested = await prisma.customerCase.findUniqueOrThrow({ where: { id: msgs[0]!.suggestedCaseId! }, include: { customer: true } });
    expect(suggested.customer.name).toBe('Bakı Retail');
  });

  it('attaching needs access to the case and turns the message into a customer source exactly once', async () => {
    const msg = await prisma.inboundMessage.findFirstOrThrow({ where: { provider: 'WHATSAPP', status: 'NEW' } });
    const kase = await caseByTitle('Onlayn mağaza saytı'); // owned by Nihat
    const outsider = await outsiderAgent();
    expect((await outsider.post(`/api/integrations/inbox/${msg.id}/attach`, { caseId: kase.id })).status).toBe(403);

    const owner = await login('nihat@mindrift.az');
    const ok = await owner.post(`/api/integrations/inbox/${msg.id}/attach`, { caseId: kase.id });
    expect(ok.status).toBe(200);
    const source = await prisma.source.findUniqueOrThrow({ where: { id: ok.body.sourceId } });
    expect(source).toMatchObject({ caseId: kase.id, type: 'WHATSAPP', origin: 'INTEGRATION', authorSide: 'CUSTOMER', content: 'Sifarişlər yenə itir!' });
    expect((await owner.post(`/api/integrations/inbox/${msg.id}/attach`, { caseId: kase.id })).status).toBe(409);
  });

  it('Telegram webhook requires the generated secret token', async () => {
    const admin = await login('elcan@mindrift.az');
    expect((await admin.put('/api/integrations/telegram', { enabled: true, config: { botToken: '1:abc' } })).status).toBe(200);
    const row = await prisma.integration.findUniqueOrThrow({ where: { provider: 'TELEGRAM' } });
    const secret = JSON.parse(row.configJson).webhookSecret as string;
    const update = { update_id: 1, message: { message_id: 7, date: 1760000000, text: 'Salam', chat: { id: 555 }, from: { first_name: 'Aylin' } } };
    expect((await request(app).post('/api/webhooks/telegram').send(update)).status).toBe(401);
    expect((await request(app).post('/api/webhooks/telegram').set('X-Telegram-Bot-Api-Secret-Token', secret).send(update)).status).toBe(200);
    expect(await prisma.inboundMessage.count({ where: { provider: 'TELEGRAM', fromName: 'Aylin' } })).toBe(1);
  });
});
