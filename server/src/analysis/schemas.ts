import { z } from 'zod';
import {
  BLOCKER_CATEGORIES,
  CONTRADICTION_TOPICS,
  CRITERION_STATUSES,
  EPISTEMIC,
  PROOF_VERDICTS,
  STRENGTHS,
} from '../domain/enums.js';

const optText = z
  .string()
  .nullish()
  .transform((v) => v ?? undefined);

export const EvidenceOut = z.object({
  sourceRef: z.string().min(1),
  quote: z.string().min(1).max(1000),
  label: optText,
});

export const TranslationOut = z.object({
  title: z.string(),
  explanation: z.string(),
  suggestedAction: optText,
});

/** Shape every module returns per finding (validated before anything is stored). */
export const FindingOut = z.object({
  existingFindingId: optText,
  kind: z.string().min(1),
  title: z.string().min(1).max(400),
  explanation: z.string().min(1).max(4000),
  epistemic: z.enum(EPISTEMIC),
  strength: z.enum(STRENGTHS),
  suggestedAction: optText,
  evidence: z.array(EvidenceOut).default([]),
  data: z.record(z.unknown()).nullish().transform((v) => v ?? {}),
  en: TranslationOut.nullish().transform((v) => v ?? undefined),
});
export type FindingOut = z.infer<typeof FindingOut>;

export const ModuleOut = z.object({
  findings: z.array(FindingOut).default([]),
  missingInformation: z.array(z.string()).default([]),
});
export type ModuleOut = z.infer<typeof ModuleOut>;

/** Module/kind-specific payloads. Findings whose payload does not validate are dropped. */
export const ContradictionData = z.object({
  topic: z.enum(CONTRADICTION_TOPICS).catch('OTHER'),
  impact: z.string().optional(),
  /** CONFLICT: both statements claim to apply. UNKNOWN_WHICH_APPLIES: cannot tell which one is in force. */
  effectiveStatus: z.enum(['CONFLICT', 'UNKNOWN_WHICH_APPLIES']).catch('CONFLICT'),
  /** True when a later, accepted change explains the difference (e.g. an agreed discount). */
  resolvedByLaterAgreement: z.boolean().default(false),
});

export const BlockerData = z.object({
  category: z.enum(BLOCKER_CATEGORIES).catch('OTHER'),
  nextStep: z.string().optional(),
  resolutionCriteria: z.string().optional(),
  suggestedDueDays: z.coerce.number().int().min(0).max(90).optional(),
  en: z.object({ nextStep: z.string().optional(), resolutionCriteria: z.string().optional() }).optional(),
});

export const BlockerResolutionData = z.object({ blockerRef: z.string() });

export const RepeatData = z.object({
  relatedCaseRef: z.string(),
  previousSolution: z.string().optional(),
  rootCauseSuggestion: z.string().optional(),
  certainty: z.enum(['LIKELY', 'UNCERTAIN']).catch('UNCERTAIN'),
});

export const VerdictData = z.object({
  verdict: z.enum(PROOF_VERDICTS),
  criteria: z
    .array(z.object({ criterionRef: z.string(), status: z.enum(CRITERION_STATUSES).catch('PENDING'), note: z.string().optional() }))
    .default([]),
});

export const HandoverPackageSchema = z.object({
  customerGoal: z.string().default(''),
  currentState: z.string().default(''),
  agreements: z.array(z.string()).default([]),
  openBlockers: z.array(z.string()).default([]),
  contradictions: z.array(z.string()).default([]),
  collectedInfo: z.array(z.string()).default([]),
  doNotAsk: z
    .array(z.object({ question: z.string(), answer: z.string(), sourceId: z.string().optional(), quote: z.string().optional() }))
    .default([]),
  nextSteps: z.array(z.object({ text: z.string(), dueDate: z.string().optional() })).default([]),
  notes: z.array(z.string()).default([]),
});
export type HandoverPackage = z.infer<typeof HandoverPackageSchema>;
