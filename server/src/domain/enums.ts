// Allowed values for string-typed status columns (SQLite has no enums).

export const ROLES = ['ADMIN', 'AGENT'] as const;
export type Role = (typeof ROLES)[number];

export const CUSTOMER_STATUSES = ['PROSPECT', 'ACTIVE', 'CHURNED'] as const;

export const CASE_STATUSES = [
  'NEW',
  'NEEDS_CLARIFICATION',
  'SOLUTION_DESIGN',
  'IN_PROGRESS',
  'AWAITING_CONFIRMATION',
  'CLOSED',
  'REOPENED',
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const SALES_OUTCOMES = ['OPEN', 'WON', 'LOST', 'NOT_APPLICABLE'] as const;

export const SOURCE_TYPES = [
  'EMAIL',
  'WHATSAPP',
  'TELEGRAM',
  'CALL_NOTE',
  'MEETING_NOTE',
  'PROPOSAL',
  'CONTRACT',
  'SUPPORT_REPLY',
  'INTERNAL_NOTE',
  'DOCUMENT',
] as const;
export const SOURCE_ORIGINS = ['MANUAL', 'PASTE', 'UPLOAD_TXT', 'UPLOAD_PDF', 'DEMO_IMPORT', 'CAMERA_OCR', 'INTEGRATION'] as const;
export const INTEGRATION_PROVIDERS = ['WHATSAPP', 'TELEGRAM'] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];
export const AUTHOR_SIDES = ['CUSTOMER', 'COMPANY'] as const;

export const MODULES = ['BRIDGE', 'ONEVOICE', 'UNBLOCK', 'RELAY', 'PROOFCLOSE', 'LOOP', 'WHYLOST', 'EXITLENS'] as const;
export type ModuleId = (typeof MODULES)[number];
/** Modules run by the case-level "Analyze with AI" button. */
export const CASE_ANALYSIS_MODULES = ['BRIDGE', 'ONEVOICE', 'UNBLOCK', 'LOOP'] as const satisfies readonly ModuleId[];
export type CaseAnalysisModule = (typeof CASE_ANALYSIS_MODULES)[number];

export const MODULE_KINDS: Record<ModuleId, readonly string[]> = {
  BRIDGE: [
    'EXPLICIT_REQUEST',
    'CORE_PROBLEM',
    'SUCCESS_CRITERION',
    'CONSTRAINT',
    'MATCH',
    'GAP',
    'NOT_NEEDED',
    'QUESTION_TO_ASK',
  ],
  ONEVOICE: ['CONTRADICTION', 'NEEDS_CLARIFICATION'],
  UNBLOCK: ['BLOCKER', 'BLOCKER_RESOLUTION'],
  RELAY: ['ALREADY_ANSWERED'],
  PROOFCLOSE: ['VERDICT'],
  LOOP: ['REPEAT_CANDIDATE'],
  WHYLOST: ['CUSTOMER_STATED_REASON', 'POSSIBLE_FACTOR', 'MISSING_INFO', 'IMPROVEMENT'],
  EXITLENS: ['EXIT_SUMMARY'],
};

export const EPISTEMIC = ['OBSERVED', 'INFERRED'] as const;
export const STRENGTHS = ['STRONG', 'MEDIUM', 'WEAK'] as const;
export const REVIEW_STATUSES = ['PENDING', 'CONFIRMED', 'REJECTED', 'RESOLVED'] as const;
export const RESULT_ORIGINS = ['REAL_AI', 'DEMO_PREPARED', 'RULES', 'MOCK'] as const;
export type ResultOrigin = (typeof RESULT_ORIGINS)[number];

export const CONTRADICTION_TOPICS = [
  'PRICE',
  'SCOPE',
  'DELIVERY_DATE',
  'SUPPORT_PERIOD',
  'PAYMENT_REFUND',
  'TECH_CAPABILITY',
  'RESPONSIBILITY',
  'OTHER',
] as const;

export const BLOCKER_CATEGORIES = [
  'BUDGET',
  'TECH_FIT',
  'DATA_MIGRATION',
  'SECURITY',
  'INTERNAL_APPROVAL',
  'UNCLEAR_TERMS',
  'UNANSWERED_QUESTION',
  'OTHER',
] as const;
export type BlockerCategory = (typeof BLOCKER_CATEGORIES)[number];
export const BLOCKER_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED'] as const;

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const;
export const TASK_ORIGINS = ['MANUAL', 'FINDING', 'ROOT_CAUSE', 'PROCESS_IMPROVEMENT'] as const;

export const CRITERION_STATUSES = ['PENDING', 'MET', 'NOT_MET'] as const;
export const CONFIRMATION_OUTCOMES = ['RESOLVED', 'PROBLEM_REMAINS'] as const;
export const PROOF_VERDICTS = ['SUPPORTED', 'INSUFFICIENT', 'UNRESOLVED'] as const;
export type ProofVerdict = (typeof PROOF_VERDICTS)[number];

export const LOSS_REASONS = ['PRICE', 'COMPETITOR', 'TIMING', 'NO_DECISION', 'PRODUCT_FIT', 'OTHER'] as const;
