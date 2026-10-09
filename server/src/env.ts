import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1).default('file:./dev.db'),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  ANTHROPIC_MODEL: z.string().min(1).default('claude-opus-5-5'),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),
  DEMO_MODE: z
    .string()
    .optional()
    .transform((v) => (v ?? 'true').toLowerCase() !== 'false'),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? undefined : v.toLowerCase() === 'true')),
  AI_MAX_INPUT_CHARS: z.coerce.number().int().positive().default(120_000),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isTest = env.NODE_ENV === 'test';
export const isProd = env.NODE_ENV === 'production';
