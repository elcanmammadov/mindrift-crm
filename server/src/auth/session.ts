import { createHmac, randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { env, isProd } from '../env.js';
import { HttpError, forbidden } from '../lib/http.js';
import type { Role } from '../domain/enums.js';

export const SESSION_COOKIE = 'mr_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
    rawBody?: Buffer;
  }
}

/** Cookie tokens are stored only as an HMAC so a leaked DB does not leak live sessions. */
export const hashToken = (token: string) => createHmac('sha256', env.SESSION_SECRET).update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export async function createSession(res: Response, userId: string) {
  const token = newToken();
  await prisma.session.create({
    data: { id: hashToken(token), userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // Explicit COOKIE_SECURE wins; otherwise Secure cookies in production (HTTPS expected).
    secure: env.COOKIE_SECURE ?? isProd,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

export async function destroySession(req: Request, res: Response) {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (token) await prisma.session.deleteMany({ where: { id: hashToken(token) } });
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (token) {
    const session = await prisma.session.findUnique({ where: { id: hashToken(token) }, include: { user: true } });
    if (session && session.expiresAt > new Date()) {
      const u = session.user;
      req.user = { id: u.id, email: u.email, name: u.name, role: u.role as Role };
    }
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'UNAUTHENTICATED', 'Login required'));
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'UNAUTHENTICATED', 'Login required'));
    if (!roles.includes(req.user.role)) return next(forbidden('Insufficient role'));
    next();
  };
}

export const userOf = (req: Request): AuthUser => {
  if (!req.user) throw new HttpError(401, 'UNAUTHENTICATED', 'Login required');
  return req.user;
};

export const actorOf = (req: Request) => {
  const u = userOf(req);
  return { type: 'USER' as const, id: u.id, name: u.name };
};
