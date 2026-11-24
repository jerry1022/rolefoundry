import { ProviderFailure, type ProviderFailureKind } from "../model";
import type { AdapterCall, AdapterResponse, GatewayAdapter } from "../ports";

export type FakeStep =
  | { text: string; reportedModel?: string; usage?: { inputTokens: number; outputTokens: number } }
  | { fail: ProviderFailureKind; retryAfterMs?: number }
  | { hang: true };

/** Scripted adapter for tests and offline evaluation. It never performs network access. */
export class FakeAdapter implements GatewayAdapter {
  readonly calls: AdapterCall[] = [];
  private index = 0;
  constructor(
    readonly id: string,
    private readonly steps: FakeStep[] | ((call: AdapterCall) => FakeStep),
  ) {}
  async complete(call: AdapterCall, signal: AbortSignal): Promise<AdapterResponse> {
    this.calls.push(call);
    signal.throwIfAborted();
    const step =
      typeof this.steps === "function"
        ? this.steps(call)
        : this.steps[Math.min(this.index++, this.steps.length - 1)];
    if ("fail" in step) throw new ProviderFailure(step.fail, step.retryAfterMs ?? null);
    if ("hang" in step)
      return new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
      );
    return {
      text: step.text,
      reportedModel: step.reportedModel ?? call.model,
      usage: step.usage ?? { inputTokens: 10, outputTokens: 5 },
    };
  }
}
