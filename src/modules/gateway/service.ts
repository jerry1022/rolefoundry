import type { z } from "zod";
import {
  gatewayRequestSchema,
  ProviderFailure,
  transientFailures,
  type GatewayAttempt,
  type GatewayRequest,
  type GatewayResult,
  type GatewayResultState,
  type GatewayUsage,
  type ProviderFailureKind,
} from "./model";
import { purposeRoute, routeRecipients, type GatewayPolicy, type GatewayRoute } from "./policy";
import type {
  AdapterResponse,
  ChatMessage,
  GatewayAdapter,
  GatewayAuthority,
  GatewayClock,
  PurposeTemplate,
} from "./ports";
import { buildMessages, inputSize, minimizeSegments, repairMessages } from "./prompt";

export interface OutputSpec<T> {
  schema: z.ZodType<T>;
  /** Strict JSON Schema sent to providers; validation still uses `schema`. */
  jsonSchema: { name: string; schema: Record<string, unknown> };
  /** Every reference the output cites; each must be in `allowedRefs`. */
  references(output: T): string[];
  /** Optional factual check against the minimized input (e.g. no invented numbers). */
  verify?(output: T, request: GatewayRequest): boolean;
}

export const systemClock: GatewayClock = {
  now: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise<void>((resolve, reject) => {
      if (signal.aborted) return reject(signal.reason);
      const done = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", stop);
      };
      const stop = () => {
        done();
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        done();
        resolve();
      }, ms);
      signal.addEventListener("abort", stop, { once: true });
    }),
};

/** Per-adapter concurrency gate shared by every purpose that routes to the adapter. */
class Gate {
  private active = 0;
  private readonly waiters: Array<() => void> = [];
  async acquire(limit: number, signal: AbortSignal) {
    while (this.active >= limit) {
      signal.throwIfAborted();
      await new Promise<void>((resolve, reject) => {
        const wake = () => {
          signal.removeEventListener("abort", stop);
          resolve();
        };
        const stop = () => {
          const index = this.waiters.indexOf(wake);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(signal.reason);
        };
        this.waiters.push(wake);
        signal.addEventListener("abort", stop, { once: true });
      });
    }
    this.active++;
  }
  release() {
    this.active--;
    this.waiters.shift()?.();
  }
}

/** Everything one execution shares, built once after admission. */
interface Execution {
  route: GatewayRoute;
  messages: ChatMessage[];
  jsonSchema: OutputSpec<unknown>["jsonSchema"];
  attempts: GatewayAttempt[];
  /** Caller cancellation combined with the shared task deadline. */
  signal: AbortSignal;
  startedAt: number;
}

/** Which provider is called, and why. */
interface CallPlan {
  target: { adapter: string; model: string };
  phase: GatewayAttempt["phase"];
  kind: GatewayAttempt["kind"];
  fallbackReason: ProviderFailureKind | null;
}

type CallOutcome = { plan: CallPlan } & (
  { response: AdapterResponse } | { failure: ProviderFailureKind; retryAfterMs: number | null }
);

/** Safe task codes; provider messages are never surfaced. */
const failureCodes: Record<ProviderFailureKind, string> = {
  timeout: "RF_PROVIDER_TIMEOUT",
  throttled: "RF_PROVIDER_UNAVAILABLE",
  unavailable: "RF_PROVIDER_UNAVAILABLE",
  authentication: "RF_PROVIDER_CONFIGURATION",
  permission: "RF_PROVIDER_CONFIGURATION",
  quota: "RF_PROVIDER_QUOTA",
  "invalid-request": "RF_PROVIDER_REJECTED",
  unsupported: "RF_PROVIDER_UNSUPPORTED",
  cancelled: "RF_CANCELLED",
};

/** Deadline aborts become `timeout`, caller aborts `cancelled`; unknown adapter errors never retry. */
function classify(error: unknown, signal: AbortSignal): ProviderFailureKind {
  if (signal.aborted) return signal.reason instanceof ProviderFailure ? "timeout" : "cancelled";
  return error instanceof ProviderFailure ? error.kind : "invalid-request";
}

function resultBuilder<T>(
  request: GatewayRequest | null,
  attempts: GatewayAttempt[],
  elapsed: () => number,
) {
  return (
    state: GatewayResultState,
    code: string | null,
    output: T | null = null,
    served: { adapter: string; model: string } | null = null,
  ): GatewayResult<T> => ({
    state,
    output: state === "succeeded" ? output : null,
    code,
    purpose: request?.purpose ?? "resume.wording",
    taskId: request?.taskId ?? "",
    inputVersion: request?.inputVersion ?? "",
    templateVersion: request?.templateVersion ?? "",
    provider: served?.adapter ?? null,
    model: served?.model ?? null,
    attempts,
    usage: attempts.reduce<GatewayUsage>(
      (sum, attempt) => ({
        inputTokens: sum.inputTokens + (attempt.usage?.inputTokens ?? 0),
        outputTokens: sum.outputTokens + (attempt.usage?.outputTokens ?? 0),
      }),
      { inputTokens: 0, outputTokens: 0 },
    ),
    latencyMs: elapsed(),
  });
}

/**
 * The single controlled path for model calls. Domain modules own the decision and the
 * authority; this service owns policy, bounded execution, validation and traceability.
 */
export class AIGateway {
  private readonly gates = new Map<string, Gate>();
  private readonly adapters: Map<string, GatewayAdapter>;
  private readonly templates: Map<string, PurposeTemplate>;
  constructor(
    private readonly policy: GatewayPolicy,
    adapters: readonly GatewayAdapter[],
    templates: readonly PurposeTemplate[],
    private readonly authority: GatewayAuthority,
    private readonly clock: GatewayClock = systemClock,
  ) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.id, adapter]));
    this.templates = new Map(templates.map((template) => [template.purpose, template]));
    for (const route of Object.values(policy.routes)) {
      if (!route) continue;
      for (const target of [route.primary, route.fallback])
        if (target && !this.adapters.has(target.adapter))
          throw new Error("AI gateway policy references an unconfigured adapter.");
    }
  }

  async execute<T>(
    input: unknown,
    spec: OutputSpec<T>,
    signal: AbortSignal,
  ): Promise<GatewayResult<T>> {
    const startedAt = this.clock.now();
    const attempts: GatewayAttempt[] = [];
    const parsed = gatewayRequestSchema.safeParse(input);
    const finish = resultBuilder<T>(parsed.success ? parsed.data : null, attempts, () =>
      Math.max(0, this.clock.now() - startedAt),
    );
    if (!parsed.success) return finish("rejected", "RF_INVALID_INPUT");
    const request = parsed.data;
    if (signal.aborted) return finish("cancelled", "RF_CANCELLED");
    const template = this.templates.get(request.purpose);
    if (!template || template.version !== request.templateVersion)
      return finish("rejected", "RF_TEMPLATE_MISMATCH");
    const route = purposeRoute(this.policy, request.purpose);
    if (!route) return finish("rejected", "RF_GATEWAY_DISABLED");

    // One shared deadline covers authorization, retries, fallback, repair and publication.
    const deadline = new AbortController();
    const timer = setTimeout(
      () => deadline.abort(new ProviderFailure("timeout")),
      route.deadlineMs,
    );
    const shared = AbortSignal.any([signal, deadline.signal]);
    const failed = (kind: ProviderFailureKind) =>
      kind === "cancelled" || signal.aborted
        ? finish("cancelled", "RF_CANCELLED")
        : finish("provider-failed", failureCodes[kind]);
    try {
      const admission = await this.authority.admit(request, routeRecipients(route), shared);
      if (!admission.admitted) return finish("rejected", admission.code);
      const segments = minimizeSegments(request.segments);
      if (inputSize(segments, request.instructions) > route.maxInputChars)
        return finish("rejected", "RF_GATEWAY_INPUT_TOO_LARGE");
      const execution: Execution = {
        route,
        messages: buildMessages(request, template.system, segments),
        jsonSchema: spec.jsonSchema,
        attempts,
        signal: shared,
        startedAt,
      };

      let outcome = await this.callRoute(execution);
      if ("failure" in outcome) return failed(outcome.failure);
      let checked = this.check(outcome.response.text, spec, request);
      if (!checked.ok && checked.repairable) {
        // One bounded repair on the same provider; the original failure stays in `attempts`.
        attempts[attempts.length - 1].outcome = checked.outcome;
        outcome = await this.callOnce(
          execution,
          { ...outcome.plan, kind: "repair" },
          repairMessages(execution.messages, checked.problem),
        );
        if ("failure" in outcome) return failed(outcome.failure);
        checked = this.check(outcome.response.text, spec, request);
      }
      if (!checked.ok) {
        attempts[attempts.length - 1].outcome = checked.outcome;
        return checked.outcome === "invalid-reference"
          ? finish("invalid-reference", "RF_GATEWAY_INVALID_REFERENCE")
          : finish("invalid-output", "RF_GATEWAY_INVALID_OUTPUT");
      }
      if (!(await this.authority.stillCurrent(request, shared))) return finish("stale", "RF_STALE");
      shared.throwIfAborted();
      return finish("succeeded", null, checked.value, outcome.plan.target);
    } catch {
      return failed(signal.aborted ? "cancelled" : "timeout");
    } finally {
      clearTimeout(timer);
    }
  }

  /** Bounded primary attempts, then at most one policy-approved transient fallback. */
  private async callRoute(execution: Execution): Promise<CallOutcome> {
    const { route, signal } = execution;
    const primary: CallPlan = {
      target: route.primary,
      phase: "primary",
      kind: "call",
      fallbackReason: null,
    };
    let last: CallOutcome | null = null;
    for (let index = 0; index < route.primaryAttempts; index++) {
      last = await this.callOnce(execution, primary);
      if ("response" in last || !transientFailures.includes(last.failure) || signal.aborted)
        return last;
      if (index + 1 < route.primaryAttempts) {
        const wait = last.retryAfterMs ?? 250 * 2 ** index;
        const remaining = route.deadlineMs - (this.clock.now() - execution.startedAt);
        // Never sleep past the shared deadline; a provider wait longer than that ends retries.
        if (wait >= remaining) break;
        await this.clock.sleep(wait, signal);
      }
    }
    const reason = last && "failure" in last ? last.failure : "unavailable";
    if (route.fallback?.enabled && transientFailures.includes(reason) && !signal.aborted)
      return this.callOnce(execution, {
        target: route.fallback,
        phase: "fallback",
        kind: "call",
        fallbackReason: reason,
      });
    return last ?? { plan: primary, failure: reason, retryAfterMs: null };
  }

  /** One adapter call under the adapter's concurrency gate, always recorded as an attempt. */
  private async callOnce(
    execution: Execution,
    plan: CallPlan,
    messages: ChatMessage[] = execution.messages,
  ): Promise<CallOutcome> {
    const { route, signal } = execution;
    const adapter = this.adapters.get(plan.target.adapter)!;
    const gate = this.gates.get(adapter.id) ?? new Gate();
    this.gates.set(adapter.id, gate);
    const record: GatewayAttempt = {
      provider: adapter.id,
      model: plan.target.model,
      reportedModel: null,
      phase: plan.phase,
      kind: plan.kind,
      outcome: "ok",
      latencyMs: 0,
      usage: null,
      fallbackReason: plan.fallbackReason,
    };
    let acquired = false;
    const begin = this.clock.now();
    try {
      await gate.acquire(route.concurrency, signal);
      acquired = true;
      const response = await adapter.complete(
        {
          model: plan.target.model,
          messages,
          jsonSchema: execution.jsonSchema,
          maxOutputTokens: route.maxOutputTokens,
        },
        signal,
      );
      signal.throwIfAborted();
      record.reportedModel = response.reportedModel;
      record.usage = response.usage;
      return { plan, response };
    } catch (error) {
      const failure = classify(error, signal);
      record.outcome = failure;
      return {
        plan,
        failure,
        retryAfterMs: error instanceof ProviderFailure ? error.retryAfterMs : null,
      };
    } finally {
      if (acquired) gate.release();
      record.latencyMs = Math.max(0, this.clock.now() - begin);
      execution.attempts.push(record);
    }
  }

  private check<T>(
    text: string,
    spec: OutputSpec<T>,
    request: GatewayRequest,
  ):
    | { ok: true; value: T }
    | {
        ok: false;
        repairable: boolean;
        outcome: "invalid-json" | "invalid-schema" | "invalid-reference";
        problem: string;
      } {
    let raw: unknown;
    try {
      raw = JSON.parse(text.trim());
    } catch {
      return { ok: false, repairable: true, outcome: "invalid-json", problem: "Not valid JSON." };
    }
    const result = spec.schema.safeParse(raw);
    if (!result.success) {
      // Paths and issue codes only; never echo model text back into telemetry.
      const problem = result.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.code}`)
        .join("; ");
      return { ok: false, repairable: true, outcome: "invalid-schema", problem };
    }
    const allowed = new Set(request.allowedRefs);
    // A fabricated reference is a factual failure; it is never repaired or re-routed.
    if (spec.references(result.data).some((ref) => !allowed.has(ref)))
      return { ok: false, repairable: false, outcome: "invalid-reference", problem: "" };
    if (spec.verify && !spec.verify(result.data, request))
      return { ok: false, repairable: false, outcome: "invalid-reference", problem: "" };
    return { ok: true, value: result.data };
  }
}
