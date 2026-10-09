import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { forbidden, notFound } from '../lib/http.js';
import type { AuthUser } from './session.js';

/**
 * Case visibility rule (enforced on every case-scoped endpoint):
 * - ADMIN sees everything.
 * - AGENT sees cases they own, plus cases with a pending handover addressed to them.
 */
export function caseScope(user: AuthUser): Prisma.CustomerCaseWhereInput {
  if (user.role === 'ADMIN') return {};
  return {
    OR: [{ ownerId: user.id }, { handovers: { some: { toUserId: user.id, status: 'PENDING' } } }],
  };
}

export async function assertCaseAccess(user: AuthUser, caseId: string) {
  const found = await prisma.customerCase.findFirst({ where: { id: caseId, ...caseScope(user) } });
  if (!found) {
    // Do not reveal whether the case exists to agents without access.
    const exists = await prisma.customerCase.count({ where: { id: caseId } });
    throw exists ? forbidden('You do not have access to this case') : notFound('Case');
  }
  return found;
}

/** Customers are visible to agents through cases they can see; brand-new customers without cases are shared. */
export function customerScope(user: AuthUser): Prisma.CustomerWhereInput {
  if (user.role === 'ADMIN') return {};
  return { OR: [{ cases: { some: caseScope(user) } }, { cases: { none: {} } }] };
}

export async function assertCustomerAccess(user: AuthUser, customerId: string) {
  const found = await prisma.customer.findFirst({ where: { id: customerId, ...customerScope(user) } });
  if (!found) {
    const exists = await prisma.customer.count({ where: { id: customerId } });
    throw exists ? forbidden('You do not have access to this customer') : notFound('Customer');
  }
  return found;
}
