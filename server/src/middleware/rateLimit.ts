import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { isTest } from '../env.js';

const skip = () => isTest;

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts, try again later' } },
});

/** AI calls cost money and time: limit per logged-in user (or per IP for customer links). */
export const aiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  keyGenerator: (req: Request) => req.user?.id ?? `ip:${req.ip}`,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many AI requests, try again in a few minutes' } },
});

export const publicLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
});
