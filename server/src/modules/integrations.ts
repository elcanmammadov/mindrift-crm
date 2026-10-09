import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { prisma } from '../db.js';
import { parseJson, toJson } from '../lib/json.js';
import type { IntegrationProvider } from '../domain/enums.js';

/**
 * Messaging integrations. Incoming messages are stored in an inbox and only become
 * case sources when a person attaches them, so nothing reaches the AI analysis unseen.
 */

export interface WhatsAppConfig {
  phoneNumberId?: string;
  accessToken?: string;
  verifyToken?: string;
  appSecret?: string;
}
export interface TelegramConfig {
  botToken?: string;
  webhookSecret?: string;
  updateOffset?: number;
}
type AnyConfig = WhatsAppConfig & TelegramConfig;

export const SECRET_FIELDS = new Set(['accessToken', 'appSecret', 'botToken', 'webhookSecret']);
const GRAPH = 'https://graph.facebook.com/v21.0';
const TELEGRAM = 'https://api.telegram.org';

export async function getIntegration(provider: IntegrationProvider) {
  const row = await prisma.integration.findUnique({ where: { provider } });
  return { enabled: row?.enabled ?? false, config: parseJson<AnyConfig>(row?.configJson, {}), lastEventAt: row?.lastEventAt ?? null, lastError: row?.lastError ?? null };
}

export async function saveIntegration(provider: IntegrationProvider, enabled: boolean, config: AnyConfig) {
  // New settings start with a clean slate: an error from old credentials must not linger.
  const data = { enabled, configJson: toJson(config), lastError: null };
  await prisma.integration.upsert({ where: { provider }, create: { provider, ...data }, update: data });
}

/** Secrets never leave the server: only "set" plus the last 4 characters. */
export function maskConfig(config: AnyConfig) {
  const out: Record<string, string | number | null> = {};
  for (const [k, v] of Object.entries(config)) {
    if (k === 'updateOffset') continue;
    out[k] = SECRET_FIELDS.has(k) && typeof v === 'string' && v ? `••••${v.slice(-4)}` : (v ?? null);
  }
  return out;
}

export const newWebhookSecret = () => randomBytes(24).toString('hex');

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

/** The open case of the customer whose phone number matches the sender (last 9 digits, so +994 / 0 prefixes do not matter). */
async function suggestCase(provider: IntegrationProvider, fromId: string) {
  if (provider !== 'WHATSAPP') return null;
  const tail = digits(fromId).slice(-9);
  if (tail.length < 7) return null;
  const customers = await prisma.customer.findMany({ where: { phone: { not: null } }, select: { id: true, phone: true } });
  const match = customers.find((c) => digits(c.phone).endsWith(tail));
  if (!match) return null;
  const kase = await prisma.customerCase.findFirst({ where: { customerId: match.id, status: { not: 'CLOSED' } }, orderBy: { updatedAt: 'desc' }, select: { id: true } });
  return kase?.id ?? null;
}

export interface IncomingMessage {
  externalId: string;
  fromId: string;
  fromName: string | null;
  text: string;
  receivedAt: Date;
}

/** Stores new messages (duplicates from provider retries are skipped). Returns how many were new. */
export async function ingest(provider: IntegrationProvider, messages: IncomingMessage[]) {
  let created = 0;
  for (const m of messages) {
    const exists = await prisma.inboundMessage.findUnique({ where: { provider_externalId: { provider, externalId: m.externalId } } });
    if (exists) continue;
    await prisma.inboundMessage.create({ data: { provider, ...m, suggestedCaseId: await suggestCase(provider, m.fromId) } });
    created++;
  }
  if (messages.length) await prisma.integration.update({ where: { provider }, data: { lastEventAt: new Date(), lastError: null } }).catch(() => {});
  return created;
}

// ------------------------------------------------------------------ WhatsApp Cloud API

/** Meta signs webhook bodies with the app secret (X-Hub-Signature-256). */
export function validWhatsAppSignature(rawBody: Buffer | undefined, header: string | undefined, appSecret: string) {
  if (!rawBody || !header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(createHmac('sha256', appSecret).update(rawBody).digest('hex'));
  const got = Buffer.from(header.slice(7));
  return expected.length === got.length && timingSafeEqual(expected, got);
}

interface WaPayload {
  entry?: { changes?: { value?: { contacts?: { wa_id?: string; profile?: { name?: string } }[]; messages?: { id: string; from: string; timestamp: string; type: string; text?: { body?: string }; caption?: string }[] } }[] }[];
}

export function parseWhatsApp(body: WaPayload): IncomingMessage[] {
  const out: IncomingMessage[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};
      const names = new Map((v.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? null]));
      for (const m of v.messages ?? []) {
        const text = m.type === 'text' ? (m.text?.body ?? '') : `[${m.type}]${m.caption ? ` ${m.caption}` : ''}`;
        if (!text.trim()) continue;
        out.push({ externalId: m.id, fromId: `+${digits(m.from)}`, fromName: names.get(m.from) ?? null, text, receivedAt: new Date(Number(m.timestamp) * 1000) });
      }
    }
  }
  return out;
}

export async function testWhatsApp(cfg: WhatsAppConfig) {
  if (!cfg.phoneNumberId || !cfg.accessToken) return { ok: false, message: 'Phone number ID and access token are required.' };
  const res = await fetch(`${GRAPH}/${encodeURIComponent(cfg.phoneNumberId)}?fields=display_phone_number,verified_name`, {
    headers: { Authorization: `Bearer ${cfg.accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as { display_phone_number?: string; verified_name?: string; error?: { message?: string } };
  return res.ok ? { ok: true, message: `${data.verified_name ?? ''} ${data.display_phone_number ?? ''}`.trim() } : { ok: false, message: data.error?.message ?? `HTTP ${res.status}` };
}

// ------------------------------------------------------------------ Telegram Bot API

interface TgUpdate {
  update_id: number;
  message?: { message_id: number; date: number; text?: string; caption?: string; chat: { id: number }; from?: { first_name?: string; last_name?: string; username?: string } };
}

export function parseTelegram(updates: TgUpdate[]): IncomingMessage[] {
  return updates.flatMap((u) => {
    const m = u.message;
    const text = m?.text ?? m?.caption;
    if (!m || !text?.trim()) return [];
    const name = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(' ') || m.from?.username || null;
    return [{ externalId: `${m.chat.id}:${m.message_id}`, fromId: String(m.chat.id), fromName: name, text, receivedAt: new Date(m.date * 1000) }];
  });
}

async function telegram<T>(token: string, method: string, params: Record<string, unknown> = {}) {
  const res = await fetch(`${TELEGRAM}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as { ok: boolean; result?: T; description?: string };
  if (!data.ok) throw new Error(data.description ?? `Telegram HTTP ${res.status}`);
  return data.result as T;
}

export async function testTelegram(cfg: TelegramConfig) {
  if (!cfg.botToken) return { ok: false, message: 'Bot token is required.' };
  try {
    const me = await telegram<{ username: string; first_name: string }>(cfg.botToken, 'getMe');
    return { ok: true, message: `@${me.username} (${me.first_name})` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

// Telegram allows only one getUpdates call per bot at a time; concurrent calls fail with "Conflict".
let telegramSync: Promise<{ fetched: number; created: number }> | null = null;

/**
 * Pulls new bot messages (long-polling style). Works without a public URL, e.g. on a laptop.
 * The manual "fetch now" button and the background poller share one in-flight request.
 */
export function syncTelegram() {
  telegramSync ??= pullTelegram().finally(() => {
    telegramSync = null;
  });
  return telegramSync;
}

async function pullTelegram() {
  const { enabled, config } = await getIntegration('TELEGRAM');
  if (!enabled || !config.botToken) return { fetched: 0, created: 0 };
  try {
    const updates = await telegram<TgUpdate[]>(config.botToken, 'getUpdates', { offset: (config.updateOffset ?? 0) + 1, timeout: 0, allowed_updates: ['message'] });
    const created = await ingest('TELEGRAM', parseTelegram(updates));
    await prisma.integration.update({ where: { provider: 'TELEGRAM' }, data: { lastError: null } });
    if (updates.length) {
      const latest = await getIntegration('TELEGRAM');
      await saveIntegration('TELEGRAM', latest.enabled, { ...latest.config, updateOffset: Math.max(...updates.map((u) => u.update_id)) });
    }
    return { fetched: updates.length, created };
  } catch (e) {
    const message = (e as Error).message;
    // Another poller (e.g. a second copy of the app with the same token) held the slot: transient, try again on the next tick.
    if (/conflict/i.test(message)) return { fetched: 0, created: 0 };
    await prisma.integration.update({ where: { provider: 'TELEGRAM' }, data: { lastError: message } }).catch(() => {});
    throw e;
  }
}

/** Background polling for Telegram while the integration is enabled (not used in tests). */
export function startTelegramPolling(intervalMs = 15_000) {
  const timer = setInterval(() => void syncTelegram().catch(() => {}), intervalMs);
  timer.unref();
}
