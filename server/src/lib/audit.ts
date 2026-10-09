import { prisma } from '../db.js';
import { toJson } from './json.js';

export type Actor =
  | { type: 'USER'; id: string; name: string }
  | { type: 'CUSTOMER'; id?: string; name?: string }
  | { type: 'SYSTEM' | 'AI'; id?: string; name?: string };

export async function audit(
  actor: Actor,
  action: string,
  opts: { caseId?: string | null; customerId?: string | null; details?: Record<string, unknown> } = {},
) {
  await prisma.auditEvent.create({
    data: {
      actorType: actor.type,
      actorId: actor.id ?? null,
      actorName: actor.name ?? null,
      action,
      caseId: opts.caseId ?? null,
      customerId: opts.customerId ?? null,
      details: toJson(opts.details ?? {}),
    },
  });
}
