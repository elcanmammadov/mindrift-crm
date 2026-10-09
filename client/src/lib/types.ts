export type Role = 'ADMIN' | 'AGENT';
export type Origin = 'REAL_AI' | 'DEMO_PREPARED' | 'RULES' | 'MOCK';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface Customer {
  id: string;
  name: string;
  industry: string | null;
  contactName: string | null;
  contactEmail: string | null;
  phone: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  caseCount?: number;
  openCaseCount?: number;
}

export interface CaseRow {
  id: string;
  customerId: string;
  title: string;
  initialRequest: string;
  coreNeed: string | null;
  status: string;
  salesOutcome: string;
  ownerId: string | null;
  owner?: { id: string; name: string; email?: string } | null;
  customer?: Customer | { id: string; name: string };
  sourcesRevision: number;
  analyzedRevision: number | null;
  closedAt: string | null;
  closeReason: string | null;
  closedManually: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Source {
  id: string;
  caseId: string;
  type: string;
  origin: string;
  title: string;
  author: string;
  authorSide: 'CUSTOMER' | 'COMPANY';
  occurredAt: string;
  packageRef: string | null;
  content: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceItem {
  id: string;
  sourceId: string;
  sourceVersion: number;
  chunkId: string | null;
  quote: string;
  startOffset: number | null;
  endOffset: number | null;
  verified: boolean;
  label: string | null;
  sourceTitle?: string;
  sourceAuthor?: string;
  sourceDate?: string;
  sourceType?: string;
  sourceChanged: boolean;
}

export interface Translation {
  title: string;
  explanation: string;
  suggestedAction?: string;
}

export interface Finding {
  id: string;
  caseId: string;
  runId: string | null;
  module: string;
  kind: string;
  title: string;
  explanation: string;
  epistemic: 'OBSERVED' | 'INFERRED';
  strength: 'STRONG' | 'MEDIUM' | 'WEAK';
  suggestedAction: string | null;
  reviewStatus: 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'RESOLVED';
  reviewNote: string | null;
  reviewedAt: string | null;
  stale: boolean;
  origin: Origin;
  data: Record<string, unknown>;
  translations: { en?: Translation };
  evidence: EvidenceItem[];
  createdAt: string;
}

export interface RunNote {
  level: 'info' | 'warning';
  code: string;
  text: string;
  textEn?: string;
}

export interface AnalysisRun {
  id: string;
  modules: string[];
  mode: Origin;
  model: string | null;
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  truncated: boolean;
  notes: RunNote[];
  error: { code: string; message: string; retryable: boolean } | null;
  stats: Record<string, number>;
  startedAt: string;
  finishedAt: string | null;
  sourceSnapshot: { sourceId: string; version: number }[];
}

export interface ModuleRunResult {
  module: string;
  status: 'SUCCEEDED' | 'UNCHANGED' | 'FAILED';
  origin?: Origin;
  error?: { code: string; message: string; retryable: boolean };
  stats?: Record<string, number>;
}

export interface Blocker {
  id: string;
  caseId: string;
  category: string;
  title: string;
  description: string | null;
  ownerId: string | null;
  owner?: { id: string; name: string } | null;
  nextStep: string | null;
  dueDate: string | null;
  resolutionCriteria: string | null;
  status: string;
  sourceId: string | null;
  evidenceQuote: string | null;
  findingId: string | null;
  resolvedAt: string | null;
  createdAt: string;
  case?: { id: string; title: string; customer: { name: string } };
}

export interface Task {
  id: string;
  caseId: string | null;
  blockerId: string | null;
  title: string;
  description: string | null;
  assigneeId: string | null;
  assignee?: { id: string; name: string } | null;
  dueDate: string | null;
  status: string;
  origin: string;
  findingId: string | null;
  createdAt: string;
  case?: { id: string; title: string; customer?: { name: string } } | null;
}

export interface HandoverPackage {
  customerGoal: string;
  currentState: string;
  agreements: string[];
  openBlockers: string[];
  contradictions: string[];
  collectedInfo: string[];
  doNotAsk: { question: string; answer: string; sourceId?: string; quote?: string }[];
  nextSteps: { text: string; dueDate?: string }[];
  notes: string[];
}

export interface Handover {
  id: string;
  caseId: string;
  fromUserId: string | null;
  toUserId: string;
  fromUser?: { id: string; name: string } | null;
  toUser?: { id: string; name: string };
  case?: { id: string; title: string; customer: { id: string; name: string } };
  package: HandoverPackage;
  origin: Origin;
  status: 'PENDING' | 'ACCEPTED';
  createdAt: string;
  acceptedAt: string | null;
}

export interface Criterion {
  id: string;
  description: string;
  evidenceRequired: string;
  requiresCustomerConfirmation: boolean;
  status: 'PENDING' | 'MET' | 'NOT_MET';
  evidenceNote: string | null;
}

export interface Confirmation {
  id: string;
  outcome: 'RESOLVED' | 'PROBLEM_REMAINS';
  note: string | null;
  createdAt: string;
}

export interface Closure {
  resolutionState: string;
  canClose: boolean;
  blockingReasons: string[];
  requiresCustomerConfirmation: boolean;
  latestConfirmation: { outcome: string; note: string | null; createdAt: string } | null;
  verdict: { verdict: string; findingId: string; reviewStatus: string; origin: string } | null;
  criteriaTotal: number;
  criteriaMet: number;
  lastCompanyReplyAt: string | null;
}

export interface Relation {
  id: string;
  status: string;
  explanation: string | null;
  other: { id: string; title: string; status: string; closeReason: string | null; createdAt: string };
  createdAt: string;
}

export interface AuditItem {
  id: string;
  actorType: string;
  actorName: string | null;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface CaseBundle {
  case: CaseRow & { customer: Customer; owner: { id: string; name: string; email: string } | null };
  analysisOutdated: boolean;
  aiMode: 'REAL' | 'DEMO';
  sources: Source[];
  findings: Finding[];
  blockers: Blocker[];
  tasks: Task[];
  handovers: Handover[];
  criteria: Criterion[];
  confirmations: Confirmation[];
  relations: Relation[];
  otherCases: { id: string; title: string; status: string; createdAt: string; closeReason: string | null }[];
  lossAnalysis: { agentReason: string; agentNote: string | null; createdAt: string } | null;
  runs: AnalysisRun[];
  latestRunByModule: Record<string, AnalysisRun>;
  commitments: { id: string; text: string; status: string; sourceId: string | null }[];
  requirements: { id: string; kind: string; text: string; epistemic: string }[];
  audit: AuditItem[];
  closure: Closure;
}

export interface ExitMessage {
  role: 'assistant' | 'customer';
  text: string;
  at: string;
}

export interface ExitSummary {
  statedReasons: string[];
  aiHypotheses: { text: string; relatedCaseIds: string[]; strength: string }[];
  coreProblem: string | null;
  affectedService: string | null;
  possibleFix: string | null;
  missing: string[];
}

export interface ExitConversation {
  id: string;
  customerId: string;
  caseId: string | null;
  status: string;
  messages: ExitMessage[];
  statedReasons: string[];
  summary: ExitSummary | null;
  summaryOrigin: string | null;
  createdAt: string;
  completedAt: string | null;
  consent?: { wantsUpdates: boolean } | null;
}
