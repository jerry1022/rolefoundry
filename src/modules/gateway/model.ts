import { z } from "zod";

/** Purposes are closed: a new model use requires a reviewed template, policy and consent text. */
export const gatewayPurposes = [
  "matching.semantic-rank",
  "resume.wording",
  "assessment.short-answer",
  "resume.skill-extraction",
] as const;
export type GatewayPurpose = (typeof gatewayPurposes)[number];

export const providerFailureKinds = [
  "timeout",
  "throttled",
  "unavailable",
  "authentication",
  "permission",
  "quota",
  "invalid-request",
  "unsupported",
  "cancelled",
] as const;
export type ProviderFailureKind = (typeof providerFailureKinds)[number];
/** Only these may be retried, and only these may trigger a single policy-approved fallback. */
export const transientFailures: readonly ProviderFailureKind[] = [
  "timeout",
  "throttled",
  "unavailable",
];

export const gatewayResultStates = [
  "succeeded",
  "rejected",
  "invalid-output",
  "invalid-reference",
  "provider-failed",
  "stale",
  "cancelled",
] as const;
export type GatewayResultState = (typeof gatewayResultStates)[number];

const id = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9._:-]+$/);
const segment = z
  .object({
    /** Stable fact/course/job reference the output may cite. */
    ref: id,
    label: z
      .string()
      .min(1)
      .max(60)
      .regex(/^[A-Za-z0-9 ._-]+$/),
    text: z.string().max(4000),
  })
  .strict();
export type GatewaySegment = z.infer<typeof segment>;

export const gatewayRequestSchema = z
  .object({
    taskId: z.uuid(),
    purpose: z.enum(gatewayPurposes),
    ownerId: z.uuid(),
    inputVersion: z.string().min(1).max(200),
    templateVersion: z.string().min(1).max(60),
    locale: z.enum(["en", "zh-TW"]),
    instructions: z.string().min(1).max(4000),
    segments: z.array(segment).min(1).max(64),
    /** References the output may contain; anything else is rejected as fabricated. */
    allowedRefs: z.array(id).max(512),
  })
  .strict();
export type GatewayRequest = z.infer<typeof gatewayRequestSchema>;

export interface GatewayUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface GatewayAttempt {
  provider: string;
  model: string;
  /** Route/model actually reported by the provider, when available. */
  reportedModel: string | null;
  phase: "primary" | "fallback";
  kind: "call" | "repair";
  outcome: "ok" | ProviderFailureKind | "invalid-json" | "invalid-schema" | "invalid-reference";
  latencyMs: number;
  usage: GatewayUsage | null;
  /** Estimated cost in micro-dollars from reported usage and configured pricing; null if unknown. */
  costMicros: number | null;
  fallbackReason: ProviderFailureKind | null;
}

export interface GatewayResult<T> {
  state: GatewayResultState;
  /** Validated output; present only when state is `succeeded`. */
  output: T | null;
  /** Safe code for task errors; never a provider message or user content. */
  code: string | null;
  purpose: GatewayPurpose;
  taskId: string;
  inputVersion: string;
  templateVersion: string;
  provider: string | null;
  model: string | null;
  attempts: GatewayAttempt[];
  usage: GatewayUsage;
  /** Sum of known attempt costs (micro-dollars); null when no attempt had pricing and usage. */
  costMicros: number | null;
  latencyMs: number;
}

export class ProviderFailure extends Error {
  constructor(
    readonly kind: ProviderFailureKind,
    readonly retryAfterMs: number | null = null,
  ) {
    super(`Provider failure: ${kind}`);
  }
}
