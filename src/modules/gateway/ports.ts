import type { GatewayPurpose, GatewayRequest, GatewayResult, GatewayUsage } from "./model";

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface AdapterCall {
  model: string;
  messages: ChatMessage[];
  /** JSON Schema for strict structured output; adapters without support must fail `unsupported`. */
  jsonSchema: { name: string; schema: Record<string, unknown> };
  maxOutputTokens: number;
}

export interface AdapterResponse {
  text: string;
  reportedModel: string | null;
  usage: GatewayUsage | null;
}

/**
 * One provider dialect. Adapters own authentication, transport, error normalization
 * and capability checks; they throw `ProviderFailure` and never expose provider text.
 */
export interface GatewayAdapter {
  readonly id: string;
  complete(call: AdapterCall, signal: AbortSignal): Promise<AdapterResponse>;
}

export interface EmbeddingAdapter {
  readonly id: string;
  embed(
    input: { model: string; dimensions: number; texts: string[] },
    signal: AbortSignal,
  ): Promise<{ vectors: number[][]; reportedModel: string | null }>;
}

/** Domain-owned authority checks; the gateway never decides consent or quota itself. */
export interface GatewayAuthority {
  /** Verifies owner/task state, quota reservation and purpose consent for these recipients. */
  admit(
    request: GatewayRequest,
    recipients: readonly string[],
    signal: AbortSignal,
  ): Promise<{ admitted: true } | { admitted: false; code: string }>;
  /** Rechecked immediately before publication: owner, input version and task lease. */
  stillCurrent(request: GatewayRequest, signal: AbortSignal): Promise<boolean>;
}

/** Durable, content-free record of each execution (attempts, usage, outcome) for audit and spend. */
export interface GatewayRecorder {
  record(result: GatewayResult<unknown>, signal: AbortSignal): Promise<void>;
}

export interface GatewayClock {
  now(): number;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
}

export type PurposeTemplate = {
  purpose: GatewayPurpose;
  version: string;
  system: string;
};
