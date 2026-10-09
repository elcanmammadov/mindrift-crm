import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { actorOf, requireAuth, requireRole } from '../auth/session.js';
import { getAiMode, getProvider, hasApiKey, AiError } from '../ai/provider.js';
import { audit } from '../lib/audit.js';
import { HttpError } from '../lib/http.js';
import { parseBody } from '../lib/validate.js';
import { aiLimiter } from '../middleware/rateLimit.js';

export const settingsRouter = Router();

/** Public-to-staff info about the AI mode. Never includes the key itself. */
settingsRouter.get('/settings', requireAuth, async (_req, res) => {
  res.json({
    aiMode: await getAiMode(),
    hasApiKey: hasApiKey(),
    model: env.ANTHROPIC_MODEL,
    demoModeEnv: env.DEMO_MODE,
    demoResetAllowed: (await getAiMode()) === 'DEMO',
    maxInputChars: env.AI_MAX_INPUT_CHARS,
  });
});

settingsRouter.put('/settings/ai-mode', requireRole('ADMIN'), async (req, res) => {
  const body = parseBody(z.object({ mode: z.enum(['DEMO', 'REAL']) }), req.body);
  if (body.mode === 'REAL' && !hasApiKey()) throw new HttpError(400, 'NO_API_KEY', 'Set ANTHROPIC_API_KEY on the server to use real AI');
  await prisma.appSetting.upsert({ where: { key: 'aiMode' }, create: { key: 'aiMode', value: body.mode }, update: { value: body.mode } });
  await audit(actorOf(req), 'AI_MODE_CHANGED', { details: { mode: body.mode } });
  res.json({ aiMode: await getAiMode() });
});

/** Live check that the configured key and model answer. Explicitly reports when real AI could not be tested. */
settingsRouter.post('/settings/test-ai', requireRole('ADMIN'), aiLimiter, async (_req, res) => {
  if (!hasApiKey()) return res.json({ ok: false, tested: false, message: 'ANTHROPIC_API_KEY is not set — real AI was not tested.' });
  const provider = await getProvider();
  if (!provider) return res.json({ ok: false, tested: false, message: 'Demo mode is active — switch to real AI to test.' });
  try {
    const started = Date.now();
    const text = await provider.completeJson({ system: 'Reply with JSON only.', user: 'Return {"ok": true}', maxTokens: 1000 });
    res.json({ ok: /"ok"\s*:\s*true/.test(text), tested: true, model: provider.model, ms: Date.now() - started });
  } catch (e) {
    res.json({ ok: false, tested: true, message: e instanceof AiError ? `${e.code}: ${e.message}` : (e as Error).message });
  }
});

/** Resets all data to the demo seed. Only available while the app runs in demo mode. */
settingsRouter.post('/demo/reset', requireRole('ADMIN'), async (req, res) => {
  if ((await getAiMode()) !== 'DEMO') throw new HttpError(403, 'NOT_DEMO_MODE', 'Demo reset is only available in demo mode');
  const { seedDemo } = await import('../seed/demo.js');
  await seedDemo();
  void req;
  res.json({ ok: true });
});
