import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { actorOf, requireAuth, requireRole, userOf } from '../auth/session.js';
import { assertCaseAccess, caseScope } from '../auth/access.js';
import { INTEGRATION_PROVIDERS, type IntegrationProvider } from '../domain/enums.js';
import { audit } from '../lib/audit.js';
import { HttpError, conflict, notFound } from '../lib/http.js';
import { parseBody } from '../lib/validate.js';
import { publicLimiter } from '../middleware/rateLimit.js';
import { createSource } from '../modules/sources.js';
import {
  getIntegration,
  ingest,
  maskConfig,
  newWebhookSecret,
  parseTelegram,
  parseWhatsApp,
  saveIntegration,
  syncTelegram,
  testTelegram,
  testWhatsApp,
  validWhatsAppSignature,
} from '../modules/integrations.js';

export const integrationsRouter = Router();
integrationsRouter.use(['/integrations'], requireAuth);

const providerOf = (req: Request): IntegrationProvider => {
  const p = String(req.params.provider).toUpperCase();
  if (!(INTEGRATION_PROVIDERS as readonly string[]).includes(p)) throw notFound('Integration');
  return p as IntegrationProvider;
};

// ------------------------------------------------------------------ settings (admin)

integrationsRouter.get('/integrations', async (_req, res) => {
  const list = await Promise.all(
    INTEGRATION_PROVIDERS.map(async (provider) => {
      const i = await getIntegration(provider);
      return { provider, enabled: i.enabled, config: maskConfig(i.config), lastEventAt: i.lastEventAt, lastError: i.lastError };
    }),
  );
  const newCount = await prisma.inboundMessage.count({ where: { status: 'NEW' } });
  res.json({ integrations: list, newCount });
});

const opt = z.string().trim().max(500).optional();
const ConfigBody = z.object({
  enabled: z.boolean(),
  config: z.object({ phoneNumberId: opt, accessToken: opt, verifyToken: opt, appSecret: opt, botToken: opt }).default({}),
});

integrationsRouter.put('/integrations/:provider', requireRole('ADMIN'), async (req, res) => {
  const provider = providerOf(req);
  const body = parseBody(ConfigBody, req.body);
  const current = await getIntegration(provider);
  // Empty fields keep the stored value (the UI only ever sees masked secrets).
  const next = { ...current.config };
  for (const [k, v] of Object.entries(body.config)) if (v) (next as Record<string, unknown>)[k] = v;
  if (provider === 'TELEGRAM' && !next.webhookSecret) next.webhookSecret = newWebhookSecret();
  if (body.enabled) {
    const missing = provider === 'WHATSAPP' ? (['phoneNumberId', 'accessToken', 'verifyToken'] as const).filter((k) => !next[k]) : next.botToken ? [] : ['botToken'];
    if (missing.length) throw new HttpError(400, 'INTEGRATION_INCOMPLETE', `Missing: ${missing.join(', ')}`, { missing });
  }
  await saveIntegration(provider, body.enabled, next);
  await audit(actorOf(req), 'INTEGRATION_UPDATED', { details: { provider, enabled: body.enabled } });
  res.json({ ok: true });
});

integrationsRouter.post('/integrations/:provider/test', requireRole('ADMIN'), async (req, res) => {
  const provider = providerOf(req);
  const { config } = await getIntegration(provider);
  try {
    res.json(provider === 'WHATSAPP' ? await testWhatsApp(config) : await testTelegram(config));
  } catch (e) {
    res.json({ ok: false, message: (e as Error).message });
  }
});

integrationsRouter.post('/integrations/telegram/sync', async (_req, res) => {
  try {
    res.json(await syncTelegram());
  } catch (e) {
    throw new HttpError(502, 'INTEGRATION_ERROR', (e as Error).message);
  }
});

// ------------------------------------------------------------------ inbox (staff)

integrationsRouter.get('/integrations/inbox', async (req, res) => {
  const status = z.enum(['NEW', 'ATTACHED', 'IGNORED']).default('NEW').parse(req.query.status ?? 'NEW');
  const messages = await prisma.inboundMessage.findMany({ where: { status }, orderBy: { receivedAt: 'desc' }, take: 200 });
  // Case titles for suggestions/attachments the user is allowed to see.
  const ids = [...new Set(messages.flatMap((m) => [m.suggestedCaseId, m.caseId]).filter((x): x is string => !!x))];
  const cases = await prisma.customerCase.findMany({
    where: { id: { in: ids }, ...caseScope(userOf(req)) },
    select: { id: true, title: true, customer: { select: { name: true } } },
  });
  const byId = new Map(cases.map((c) => [c.id, { id: c.id, title: c.title, customerName: c.customer.name }]));
  res.json({
    messages: messages.map((m) => ({
      ...m,
      suggestedCase: m.suggestedCaseId ? (byId.get(m.suggestedCaseId) ?? null) : null,
      attachedCase: m.caseId ? (byId.get(m.caseId) ?? null) : null,
    })),
  });
});

async function loadNew(id: string) {
  const m = await prisma.inboundMessage.findUnique({ where: { id } });
  if (!m) throw notFound('Message');
  if (m.status !== 'NEW') throw conflict('ALREADY_HANDLED', 'This message was already handled');
  return m;
}

integrationsRouter.post('/integrations/inbox/:id/attach', async (req, res) => {
  const user = userOf(req);
  const { caseId } = parseBody(z.object({ caseId: z.string().min(1) }), req.body);
  const m = await loadNew(req.params.id as string);
  const kase = await assertCaseAccess(user, caseId);
  const label = m.provider === 'WHATSAPP' ? 'WhatsApp' : 'Telegram';
  const source = await createSource(
    kase.id,
    {
      type: m.provider,
      origin: 'INTEGRATION',
      title: `${label}: ${m.fromName ?? m.fromId}`,
      author: m.fromName ? `${m.fromName} (${m.fromId})` : m.fromId,
      authorSide: 'CUSTOMER',
      occurredAt: m.receivedAt,
      content: m.text,
    },
    actorOf(req),
    user.id,
  );
  await prisma.inboundMessage.update({ where: { id: m.id }, data: { status: 'ATTACHED', caseId: kase.id, sourceId: source.id, handledById: user.id } });
  res.json({ ok: true, sourceId: source.id });
});

integrationsRouter.post('/integrations/inbox/:id/ignore', async (req, res) => {
  const m = await loadNew(req.params.id as string);
  await prisma.inboundMessage.update({ where: { id: m.id }, data: { status: 'IGNORED', handledById: userOf(req).id } });
  res.json({ ok: true });
});

// ------------------------------------------------------------------ public webhooks (called by Meta / Telegram)

export const webhooksRouter = Router();
webhooksRouter.use('/webhooks', publicLimiter);

/** Meta's one-time verification handshake when the webhook URL is registered. */
webhooksRouter.get('/webhooks/whatsapp', async (req, res) => {
  const { enabled, config } = await getIntegration('WHATSAPP');
  if (enabled && req.query['hub.mode'] === 'subscribe' && config.verifyToken && req.query['hub.verify_token'] === config.verifyToken) {
    return res.status(200).send(String(req.query['hub.challenge'] ?? ''));
  }
  res.sendStatus(403);
});

webhooksRouter.post('/webhooks/whatsapp', async (req, res) => {
  const { enabled, config } = await getIntegration('WHATSAPP');
  if (!enabled) return res.sendStatus(404);
  if (config.appSecret && !validWhatsAppSignature(req.rawBody, req.get('x-hub-signature-256'), config.appSecret)) return res.sendStatus(401);
  await ingest('WHATSAPP', parseWhatsApp(req.body));
  res.sendStatus(200); // Meta retries anything that is not 200
});

webhooksRouter.post('/webhooks/telegram', async (req, res) => {
  const { enabled, config } = await getIntegration('TELEGRAM');
  if (!enabled) return res.sendStatus(404);
  if (!config.webhookSecret || req.get('x-telegram-bot-api-secret-token') !== config.webhookSecret) return res.sendStatus(401);
  await ingest('TELEGRAM', parseTelegram([req.body]));
  res.sendStatus(200);
});
