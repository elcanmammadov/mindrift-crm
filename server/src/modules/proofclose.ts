import { prisma } from '../db.js';
import { parseJson } from '../lib/json.js';

export type ResolutionState =
  | 'NOT_EVALUATED'
  | 'INSUFFICIENT_EVIDENCE'
  | 'UNRESOLVED'
  | 'EVIDENCE_SUPPORTED'
  | 'AWAITING_CUSTOMER'
  | 'CUSTOMER_CONFIRMED'
  | 'PROBLEM_REMAINS'
  | 'MANUALLY_CLOSED';

export interface ClosureState {
  resolutionState: ResolutionState;
  canClose: boolean;
  blockingReasons: string[];
  requiresCustomerConfirmation: boolean;
  latestConfirmation: { outcome: string; note: string | null; createdAt: Date } | null;
  verdict: { verdict: string; findingId: string; reviewStatus: string; origin: string } | null;
  criteriaTotal: number;
  criteriaMet: number;
  lastCompanyReplyAt: Date | null;
}

/**
 * Closing rules — "an employee replied" is never the same as "the problem is solved":
 * - at least one resolution criterion must exist;
 * - evidence: every criterion marked MET by staff, OR an evaluation verdict SUPPORTED that a human accepted;
 * - if any criterion needs customer confirmation, the latest customer answer must be RESOLVED
 *   (an AI verdict can never stand in for it);
 * - a customer answer "problem remains" always blocks closing.
 * Admins can still close manually with a reason; that is recorded separately and never shown as customer confirmation.
 */
export async function getClosureState(caseId: string): Promise<ClosureState> {
  const [c, criteria, confirmations, verdictFinding, lastReply] = await Promise.all([
    prisma.customerCase.findUniqueOrThrow({ where: { id: caseId } }),
    prisma.resolutionCriterion.findMany({ where: { caseId } }),
    prisma.customerConfirmation.findMany({ where: { caseId }, orderBy: { createdAt: 'desc' }, take: 1 }),
    prisma.finding.findFirst({
      where: { caseId, module: 'PROOFCLOSE', kind: 'VERDICT', stale: false },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.source.findFirst({
      where: { caseId, deletedAt: null, authorSide: 'COMPANY' },
      orderBy: { occurredAt: 'desc' },
    }),
  ]);
  const latest = confirmations[0] ?? null;
  const requiresCustomerConfirmation = criteria.some((k) => k.requiresCustomerConfirmation);
  const verdictData = verdictFinding ? parseJson<{ verdict?: string }>(verdictFinding.data, {}) : {};
  const verdict = verdictFinding
    ? { verdict: verdictData.verdict ?? 'INSUFFICIENT', findingId: verdictFinding.id, reviewStatus: verdictFinding.reviewStatus, origin: verdictFinding.origin }
    : null;

  const criteriaMet = criteria.filter((k) => k.status === 'MET').length;
  const allMet = criteria.length > 0 && criteriaMet === criteria.length;
  const anyNotMet = criteria.some((k) => k.status === 'NOT_MET');
  const verdictAccepted = verdict?.verdict === 'SUPPORTED' && verdict.reviewStatus === 'CONFIRMED';
  const evidenceOk = !anyNotMet && (allMet || verdictAccepted);
  const customerOk = !requiresCustomerConfirmation || latest?.outcome === 'RESOLVED';
  const problemRemains = latest?.outcome === 'PROBLEM_REMAINS';

  const blockingReasons: string[] = [];
  if (criteria.length === 0) blockingReasons.push('NO_CRITERIA');
  if (!evidenceOk) blockingReasons.push('EVIDENCE_NOT_SUFFICIENT');
  if (problemRemains) blockingReasons.push('CUSTOMER_REPORTED_PROBLEM_REMAINS');
  else if (!customerOk) blockingReasons.push('CUSTOMER_CONFIRMATION_MISSING');

  let resolutionState: ResolutionState;
  if (c.status === 'CLOSED' && c.closedManually) resolutionState = 'MANUALLY_CLOSED';
  else if (problemRemains) resolutionState = 'PROBLEM_REMAINS';
  else if (latest?.outcome === 'RESOLVED' && evidenceOk) resolutionState = 'CUSTOMER_CONFIRMED';
  else if (evidenceOk && requiresCustomerConfirmation) resolutionState = 'AWAITING_CUSTOMER';
  else if (evidenceOk) resolutionState = 'EVIDENCE_SUPPORTED';
  else if (anyNotMet || verdict?.verdict === 'UNRESOLVED') resolutionState = 'UNRESOLVED';
  else if (verdict || criteriaMet > 0) resolutionState = 'INSUFFICIENT_EVIDENCE';
  else resolutionState = 'NOT_EVALUATED';

  return {
    resolutionState,
    canClose: blockingReasons.length === 0,
    blockingReasons,
    requiresCustomerConfirmation,
    latestConfirmation: latest ? { outcome: latest.outcome, note: latest.note, createdAt: latest.createdAt } : null,
    verdict,
    criteriaTotal: criteria.length,
    criteriaMet,
    lastCompanyReplyAt: lastReply?.occurredAt ?? null,
  };
}
