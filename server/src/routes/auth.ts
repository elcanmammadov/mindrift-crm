import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { createSession, destroySession, requireAuth, requireRole, userOf, verifyPassword, hashPassword, actorOf } from '../auth/session.js';
import { HttpError, conflict } from '../lib/http.js';
import { parseBody, trimmed } from '../lib/validate.js';
import { loginLimiter } from '../middleware/rateLimit.js';
import { audit } from '../lib/audit.js';

export const authRouter = Router();

authRouter.post('/auth/login', loginLimiter, async (req, res) => {
  const body = parseBody(z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) }), req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  // Same error for unknown email and wrong password.
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  await createSession(res, user.id);
  res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

authRouter.post('/auth/logout', async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
});

authRouter.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: userOf(req) });
});

authRouter.get('/users', requireAuth, async (_req, res) => {
  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true }, orderBy: { name: 'asc' } });
  res.json({ users });
});

authRouter.post('/users', requireRole('ADMIN'), async (req, res) => {
  const body = parseBody(
    z.object({
      name: trimmed(2, 100),
      email: z.string().trim().toLowerCase().email(),
      password: z.string().min(8).max(200),
      role: z.enum(['ADMIN', 'AGENT']),
    }),
    req.body,
  );
  if (await prisma.user.findUnique({ where: { email: body.email } })) throw conflict('EMAIL_TAKEN', 'Email already in use');
  const user = await prisma.user.create({
    data: { name: body.name, email: body.email, role: body.role, passwordHash: await hashPassword(body.password) },
    select: { id: true, name: true, email: true, role: true },
  });
  await audit(actorOf(req), 'USER_CREATED', { details: { userId: user.id, role: user.role } });
  res.status(201).json({ user });
});
