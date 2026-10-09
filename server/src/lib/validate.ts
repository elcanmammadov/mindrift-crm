import { z } from 'zod';
import { badRequest } from './http.js';

export function parseBody<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw badRequest(
      'Validation failed',
      r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return r.data;
}

/** Accepts "YYYY-MM-DD", full ISO strings, null or empty string. */
export const optionalDate = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    const d = new Date(v);
    if (Number.isNaN(+d)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid date' });
      return z.NEVER;
    }
    return d;
  });

export const requiredDate = z.string().refine((v) => !Number.isNaN(+new Date(v)), 'Invalid date').transform((v) => new Date(v));

export const trimmed = (min = 1, max = 5000) => z.string().trim().min(min).max(max);
