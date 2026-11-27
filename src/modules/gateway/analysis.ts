import { ApplicationError } from "../platform/errors";
import type { Actor, AnalysisFeature } from "../identity/core";
import type { GatewayRequest, GatewayResult } from "./model";

/**
 * Shared plumbing for opt-in AI analyses that ride on an existing domain task: the owner's
 * consent/allowance is reserved before the domain record exists, keyed by its request key, so a
 * worker can never start without the reservation and retries reuse it.
 */
export interface AnalysisLifecycle {
  start(identityTaskId: string, signal: AbortSignal): Promise<"running" | "failed">;
  finish(identityTaskId: string, resultRef: string, signal: AbortSignal): Promise<void>;
  fail(
    identityTaskId: string,
    category: "infrastructure" | "validation",
    signal: AbortSignal,
  ): Promise<void>;
  release(identityTaskId: string, signal: AbortSignal): Promise<void>;
}

/** Identity-owned reservation port implemented by the identity service. */
export interface AnalysisReservations {
  reserveAnalysis(
    actor: Actor,
    input: {
      feature: AnalysisFeature;
      resourceId: string;
      inputVersion: string;
      idempotencyKey: string;
    },
  ): Promise<{ taskId: string }>;
  releaseAnalysis(taskId: string): Promise<unknown>;
}

export type OptionalAnalysisState =
  | { state: "not-requested"; code: null; taskId: null }
  | { state: "reserved"; code: null; taskId: string }
  | { state: "unavailable"; code: string; taskId: null };

/** Keys shared by the reserving service and the SQL lookup (`<prefix>:` + request key). */
export function analysisKeys(prefix: string, requestKey: string) {
  return { idempotencyKey: `${prefix}:${requestKey}`, inputVersion: `${prefix}-key:${requestKey}` };
}
/** Identity idempotency keys are limited to 200 characters. */
export const fitsAnalysisKey = (prefix: string, requestKey: string) =>
  prefix.length + 1 + requestKey.length <= 200;

/** Stable UUID-shaped reference so a retried request reuses the same reservation. */
export async function deterministicId(seed: string) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed)),
  );
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = [...digest.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Missing consent or allowance never blocks the underlying rules-based work. */
export async function reserveOptionalAnalysis(
  reservations: AnalysisReservations | undefined,
  actor: Actor,
  request: { feature: AnalysisFeature; prefix: string; requestKey: string },
): Promise<OptionalAnalysisState> {
  if (!reservations || !fitsAnalysisKey(request.prefix, request.requestKey))
    return { state: "unavailable", code: "RF_NOT_CONFIGURED", taskId: null };
  try {
    const { taskId } = await reservations.reserveAnalysis(actor, {
      feature: request.feature,
      resourceId: await deterministicId(`${actor.userId}:${request.prefix}:${request.requestKey}`),
      ...analysisKeys(request.prefix, request.requestKey),
    });
    return { state: "reserved", code: null, taskId };
  } catch (error) {
    return {
      state: "unavailable",
      code: error instanceof ApplicationError ? error.code : "RF_UNAVAILABLE",
      taskId: null,
    };
  }
}

/**
 * Runs the domain request with an optional reservation; a failed request returns the unused
 * reservation so it never counts against the weekly allowance.
 */
export async function withOptionalAnalysis<T>(
  reservations: AnalysisReservations | undefined,
  analysis: OptionalAnalysisState,
  run: () => Promise<T>,
): Promise<T & { analysis: { state: OptionalAnalysisState["state"]; code: string | null } }> {
  try {
    const result = await run();
    return { ...result, analysis: { state: analysis.state, code: analysis.code } };
  } catch (error) {
    if (analysis.taskId)
      await reservations?.releaseAnalysis(analysis.taskId).catch(() => undefined);
    throw error;
  }
}

/** Gateway call plus its durable, content-free record. */
export interface OptionalGateway<T> {
  run(request: GatewayRequest, signal: AbortSignal): Promise<GatewayResult<T>>;
  record(result: GatewayResult<T>, signal: AbortSignal): Promise<void>;
}

export type OptionalOutcome<T> =
  | { kind: "not-requested" }
  | { kind: "fallback"; code: string }
  | { kind: "applied"; output: T; finalize(resultRef: string, signal: AbortSignal): Promise<void> };

/**
 * Worker-side lifecycle for a reserved analysis. Unused reservations are released (allowance
 * returned); a started analysis consumes it. Provider failures are refundable (`infrastructure`),
 * invalid output is `validation`, and a consent revocation mid-call publishes nothing. Callers
 * keep their deterministic result for every non-applied outcome.
 */
export async function runOptionalAnalysis<T>(
  dependencies: { lifecycle: AnalysisLifecycle; gateway: OptionalGateway<T> | null },
  identityTaskId: string | null,
  plan: { needed: boolean; notNeededCode: string; request: () => GatewayRequest },
  signal: AbortSignal,
): Promise<OptionalOutcome<T>> {
  const { lifecycle, gateway } = dependencies;
  if (!identityTaskId) return { kind: "not-requested" };
  if (!gateway || !plan.needed) {
    await lifecycle.release(identityTaskId, signal).catch(() => undefined);
    return { kind: "fallback", code: gateway ? plan.notNeededCode : "RF_GATEWAY_DISABLED" };
  }
  if ((await lifecycle.start(identityTaskId, signal)) === "failed")
    return { kind: "fallback", code: "RF_CONSENT_REQUIRED" };
  const result = await gateway.run(plan.request(), signal);
  // Recording is an audit/spend trail; its failure must not discard a valid result.
  await gateway.record(result, signal).catch(() => undefined);
  if (result.state === "cancelled") throw new Error("Optional analysis cancelled.");
  if (result.state !== "succeeded" || result.output === null) {
    if (result.state !== "stale")
      await lifecycle
        .fail(
          identityTaskId,
          result.state === "provider-failed" ? "infrastructure" : "validation",
          signal,
        )
        .catch(() => undefined);
    return { kind: "fallback", code: result.code ?? "RF_UNAVAILABLE" };
  }
  return {
    kind: "applied",
    output: result.output,
    finalize: (resultRef, finalSignal) => lifecycle.finish(identityTaskId, resultRef, finalSignal),
  };
}
