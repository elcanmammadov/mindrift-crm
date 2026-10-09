import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { Prisma } from '@prisma/client';
import { MulterError } from 'multer';
import { env, isTest } from './env.js';
import { HttpError } from './lib/http.js';
import { loadUser } from './auth/session.js';
import { authRouter } from './routes/auth.js';
import { customersRouter } from './routes/customers.js';
import { casesRouter } from './routes/cases.js';
import { sourcesRouter } from './routes/sources.js';
import { findingsRouter } from './routes/findings.js';
import { workRouter } from './routes/work.js';
import { handoversRouter } from './routes/handovers.js';
import { insightsRouter } from './routes/insights.js';
import { publicRouter } from './routes/public.js';
import { settingsRouter } from './routes/settings.js';
import { integrationsRouter, webhooksRouter } from './routes/integrations.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  // The raw body is kept for webhook signature checks (WhatsApp X-Hub-Signature-256).
  app.use(express.json({ limit: '2mb', verify: (req, _res, buf) => void ((req as Request).rawBody = buf) }));
  app.use(cookieParser());

  // CSRF guard: state-changing staff requests must carry a custom header, which
  // browsers only allow from our own origin (cookies are SameSite=Lax as well).
  app.use('/api', (req, _res, next) => {
    const safe = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
    // Webhooks are called server-to-server by Meta/Telegram and authenticated by their own signature/secret.
    if (!safe && !req.path.startsWith('/public/') && !req.path.startsWith('/webhooks/') && req.get('x-requested-with') !== 'mindrift') {
      return next(new HttpError(403, 'CSRF', 'Missing X-Requested-With header'));
    }
    next();
  });

  app.use('/api', loadUser);
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  for (const r of [authRouter, customersRouter, casesRouter, sourcesRouter, findingsRouter, workRouter, handoversRouter, insightsRouter, publicRouter, settingsRouter, integrationsRouter, webhooksRouter]) {
    app.use('/api', r);
  }
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'Endpoint not found')));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err instanceof MulterError) {
      return res.status(400).json({ error: { code: err.code, message: err.message } });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found' } });
    }
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Malformed JSON body' } });
    }
    if (!isTest) console.error(err);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Unexpected server error' } });
  });
  return app;
}
