import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { CONFIRMATION_OUTCOMES } from '../domain/enums.js';
import { audit } from '../lib/audit.js';
import { conflict } from '../lib/http.js';
import { parseJson, toJson } from '../lib/json.js';
import { parseBody } from '../lib/validate.js';
import { resolveCustomerToken } from '../modules/tokens.js';
import { greeting, MAX_EXIT_QUESTIONS, nextQuestion, summarizeExit, type ExitMessage } from '../modules/exitlens.js';
import { publicLimiter } from '../middleware/rateLimit.js';

/**
 * Customer-facing endpoints. Authorised only by the token in the URL; a token
 * opens exactly one case for exactly one purpose and never the customer profile.
 */
export const publicRouter = Router();
publicRouter.use('/public', publicLimiter);

const Locale = z.enum(['az', 'en']).default('az');

publicRouter.get('/public/:token', async (req, res) => {
  const t = await resolveCustomerToken(req.params.token);
  const kase = await prisma.customerCase.findUniqueOrThrow({ where: { id: t.caseId }, include: { customer: { select: { name: true } } } });
  const base = { purpose: t.purpose, customerName: kase.customer.name, caseTitle: kase.title, expiresAt: t.expiresAt };
  if (t.purpose === 'CONFIRMATION') {
    const criteria = await prisma.resolutionCriterion.findMany({
      where: { caseId: kase.id },
      select: { id: true, description: true, requiresCustomerConfirmation: true },
    });
    const answered = await prisma.customerConfirmation.findFirst({ where: { tokenId: t.id } });
    return res.json({ ...base, criteria, answered: answered ? { outcome: answered.outcome, note: answered.note, at: answered.createdAt } : null });
  }
  const conv = await prisma.exitConversation.findUnique({ where: { tokenId: t.id }, include: { consent: true } });
  res.json({
    ...base,
    conversation: conv
      ? { id: conv.id, status: conv.status, messages: parseJson(conv.messages, []), wantsUpdates: conv.consent?.wantsUpdates ?? null }
      : null,
    maxQuestions: MAX_EXIT_QUESTIONS,
  });
});

publicRouter.post('/public/:token/confirm', async (req, res) => {
  const t = await resolveCustomerToken(req.params.token, 'CONFIRMATION');
  const body = parseBody(z.object({ outcome: z.enum(CONFIRMATION_OUTCOMES), note: z.string().trim().max(2000).nullish() }), req.body);
  if (await prisma.customerConfirmation.findFirst({ where: { tokenId: t.id } })) throw conflict('ALREADY_ANSWERED', 'This link was already used');
  await recordCustomerConfirmation({ caseId: t.caseId, tokenId: t.id, outcome: body.outcome, note: body.note ?? null, actorName: 'customer link' });
  res.json({ ok: true });
});

/** Stores the customer's verdict, updates criteria that need it and reopens the case if the problem remains. */
export async function recordCustomerConfirmation(p: { caseId: string; tokenId: string | null; outcome: (typeof CONFIRMATION_OUTCOMES)[number]; note: string | null; actorName: string }) {
  const kase = await prisma.customerCase.findUniqueOrThrow({ where: { id: p.caseId } });
  const resolved = p.outcome === 'RESOLVED';
  const reopened = !resolved && (kase.status === 'CLOSED' || kase.status === 'AWAITING_CONFIRMATION');
  await prisma.$transaction([
    prisma.customerConfirmation.create({ data: { caseId: p.caseId, tokenId: p.tokenId, outcome: p.outcome, note: p.note } }),
    // The customer's answer is the evidence for criteria that require it.
    prisma.resolutionCriterion.updateMany({
      where: { caseId: p.caseId, requiresCustomerConfirmation: true },
      data: { status: resolved ? 'MET' : 'NOT_MET', evidenceNote: `Müştəri cavabı: ${resolved ? 'həll olunub' : 'problem qalır'}${p.note ? ` — "${p.note}"` : ''}` },
    }),
    ...(p.tokenId ? [prisma.customerAccessToken.update({ where: { id: p.tokenId }, data: { usedAt: new Date() } })] : []),
    ...(reopened
      ? [prisma.customerCase.update({ where: { id: kase.id }, data: { status: 'REOPENED', closedAt: null } })]
      : []),
  ]);
  await audit({ type: 'CUSTOMER', name: p.actorName }, resolved ? 'CUSTOMER_CONFIRMED_RESOLVED' : 'CUSTOMER_REPORTED_PROBLEM_REMAINS', {
    caseId: p.caseId,
    details: { note: p.note, reopened },
  });
}

// ------------------------------------------------------------- exit conversation
async function loadConversation(token: string) {
  const t = await resolveCustomerToken(token, 'EXIT');
  const kase = await prisma.customerCase.findUniqueOrThrow({ where: { id: t.caseId } });
  const conv = await prisma.exitConversation.findUnique({ where: { tokenId: t.id } });
  return { t, kase, conv };
}

const view = (conv: { id: string; status: string; messages: string }, extra: Record<string, unknown> = {}) => ({
  conversation: { id: conv.id, status: conv.status, messages: parseJson<ExitMessage[]>(conv.messages, []), ...extra },
});

publicRouter.post('/public/:token/exit/start', async (req, res) => {
  const { t, kase, conv } = await loadConversation(req.params.token);
  const { locale } = parseBody(z.object({ locale: Locale }), req.body ?? {});
  if (conv) return res.json(view(conv));
  const messages: ExitMessage[] = [{ role: 'assistant', text: greeting(locale), at: new Date().toISOString() }];
  const first = await nextQuestion(messages, locale);
  if (first.question) messages.push({ role: 'assistant', text: first.question, at: new Date().toISOString() });
  const created = await prisma.exitConversation.create({
    data: { customerId: kase.customerId, caseId: kase.id, tokenId: t.id, messages: toJson(messages) },
  });
  await audit({ type: 'CUSTOMER', name: 'customer link' }, 'EXIT_CONVERSATION_STARTED', { customerId: kase.customerId, caseId: kase.id });
  res.status(201).json(view(created));
});

const ensureActive = (conv: { status: string } | null) => {
  if (!conv) throw conflict('NOT_STARTED', 'Conversation has not started');
  if (conv.status !== 'ACTIVE') throw conflict('CONVERSATION_ENDED', 'This conversation has ended');
};

/** Customer answers (or skips with an empty answer); the next question is generated, max 4. */
publicRouter.post('/public/:token/exit/message', async (req, res) => {
  const { conv } = await loadConversation(req.params.token);
  ensureActive(conv);
  const body = parseBody(z.object({ text: z.string().trim().max(2000).default(''), skip: z.boolean().default(false), locale: Locale }), req.body);
  const messages = parseJson<ExitMessage[]>(conv!.messages, []);
  const now = () => new Date().toISOString();
  messages.push({ role: 'customer', text: body.skip || !body.text ? (body.locale === 'az' ? '(sual keçildi)' : '(question skipped)') : body.text, at: now() });
  const next = await nextQuestion(
    messages.filter((m) => !(m.role === 'customer' && /^\((sual keçildi|question skipped)\)$/.test(m.text))),
    body.locale,
  );
  if (next.question) messages.push({ role: 'assistant', text: next.question, at: now() });
  const stated = messages.filter((m) => m.role === 'customer' && !/^\((sual keçildi|question skipped)\)$/.test(m.text)).map((m) => m.text);
  const updated = await prisma.exitConversation.update({
    where: { id: conv!.id },
    data: { messages: toJson(messages), statedReasons: toJson(stated) },
  });
  res.json({ ...view(updated), done: !next.question });
});

/** Ends the conversation (finished or declined). Consent to future updates is a separate, explicit choice. */
publicRouter.post('/public/:token/exit/finish', async (req, res) => {
  const { kase, conv } = await loadConversation(req.params.token);
  ensureActive(conv);
  const body = parseBody(z.object({ declined: z.boolean().default(false), wantsUpdates: z.boolean().nullable().default(null) }), req.body ?? {});
  const messages = parseJson<ExitMessage[]>(conv!.messages, []);
  const answered = messages.some((m) => m.role === 'customer' && !/^\((sual keçildi|question skipped)\)$/.test(m.text));
  const status = body.declined || !answered ? 'SKIPPED' : 'COMPLETED';
  await prisma.exitConversation.update({ where: { id: conv!.id }, data: { status, completedAt: new Date() } });
  if (body.wantsUpdates !== null) {
    await prisma.contactConsent.upsert({
      where: { exitConversationId: conv!.id },
      create: { customerId: kase.customerId, exitConversationId: conv!.id, wantsUpdates: body.wantsUpdates },
      update: { wantsUpdates: body.wantsUpdates },
    });
  }
  if (status === 'COMPLETED') {
    const { summary, origin } = await summarizeExit(conv!.id);
    await prisma.exitConversation.update({ where: { id: conv!.id }, data: { summary: toJson(summary), summaryOrigin: origin } });
  }
  await audit({ type: 'CUSTOMER', name: 'customer link' }, status === 'COMPLETED' ? 'EXIT_CONVERSATION_COMPLETED' : 'EXIT_CONVERSATION_SKIPPED', {
    customerId: kase.customerId,
    caseId: kase.id,
    details: { wantsUpdates: body.wantsUpdates },
  });
  res.json({ ok: true, status });
});
