import { prisma } from '../db.js';
import { env } from '../env.js';
import { hashToken, newToken } from '../auth/session.js';
import { HttpError } from '../lib/http.js';

export type TokenPurpose = 'CONFIRMATION' | 'EXIT';
const TTL_DAYS = 14;

/**
 * Customer links carry a random token; only its HMAC is stored. A token grants
 * access to exactly one action (confirmation or exit conversation) for exactly one case.
 */
export async function issueCustomerToken(caseId: string, purpose: TokenPurpose, createdById?: string) {
  const token = newToken();
  const row = await prisma.customerAccessToken.create({
    data: {
      tokenHash: hashToken(token),
      caseId,
      purpose,
      expiresAt: new Date(Date.now() + TTL_DAYS * 864e5),
      createdById: createdById ?? null,
    },
  });
  const base = env.FRONTEND_URL.replace(/\/$/, '');
  return { token, url: `${base}/c/${token}`, expiresAt: row.expiresAt, id: row.id };
}

export async function resolveCustomerToken(token: string, purpose?: TokenPurpose) {
  if (!token || token.length < 20) throw new HttpError(404, 'INVALID_TOKEN', 'Link is invalid');
  const row = await prisma.customerAccessToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row) throw new HttpError(404, 'INVALID_TOKEN', 'Link is invalid');
  if (row.expiresAt < new Date()) throw new HttpError(410, 'TOKEN_EXPIRED', 'Link has expired');
  if (purpose && row.purpose !== purpose) throw new HttpError(403, 'WRONG_PURPOSE', 'This link cannot be used for this action');
  return row;
}
