import { ProviderFailure } from "../model";
import type { AdapterCall, AdapterResponse, EmbeddingAdapter, GatewayAdapter } from "../ports";

export interface OpenAICompatibleConfig {
  /** Adapter/recipient ID used by the routing policy, e.g. `openai` or `lunaroute`. */
  id: string;
  /** Deployment-owned HTTPS base URL; requests can never select another host. */
  baseUrl: string;
  /** Header dialect: OpenAI bearer tokens or LunaRoute's dedicated key header. */
  auth: "bearer" | "lunaroute-key";
  apiKey: string;
  fetch?: typeof fetch;
}

const maxResponseBytes = 1_048_576;

function validate(config: OpenAICompatibleConfig) {
  let url: URL;
  try {
    url = new URL(config.baseUrl);
  } catch {
    throw new Error("AI provider base URL is invalid.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^[a-z][a-z0-9-]{1,30}$/.test(config.id) ||
    config.apiKey.length < 8 ||
    /\s/.test(config.apiKey)
  )
    throw new Error("AI provider configuration is invalid.");
  return url.href.replace(/\/$/, "");
}

function retryAfter(value: string | null) {
  if (!value) return null;
  if (/^\d+(\.\d+)?$/.test(value)) return Math.min(Number(value) * 1000, 600_000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.min(date - Date.now(), 600_000)) : null;
}

/** Shared OpenAI-shaped transport; never returns or logs provider error text. */
async function post(
  config: OpenAICompatibleConfig,
  base: string,
  path: string,
  body: unknown,
  signal: AbortSignal,
): Promise<unknown> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.auth === "bearer") headers.Authorization = `Bearer ${config.apiKey}`;
  else headers["LUNAROUTE-API-KEY"] = config.apiKey;
  let response: Response;
  try {
    response = await (config.fetch ?? fetch)(`${base}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      redirect: "error",
      signal,
    });
  } catch {
    if (signal.aborted) throw signal.reason;
    throw new ProviderFailure("unavailable");
  }
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maxResponseBytes) throw new ProviderFailure("unavailable");
  let text: string;
  try {
    text = await response.text();
  } catch {
    if (signal.aborted) throw signal.reason;
    throw new ProviderFailure("unavailable");
  }
  if (text.length > maxResponseBytes) throw new ProviderFailure("unavailable");
  if (!response.ok) {
    const status = response.status;
    if (status === 401) throw new ProviderFailure("authentication");
    if (status === 403) throw new ProviderFailure("permission");
    if (status === 404) throw new ProviderFailure("unsupported");
    if (status === 408) throw new ProviderFailure("timeout");
    if (status === 429) {
      // Exhausted billing quota is not transient; rate limiting is.
      if (/insufficient_quota|quota_exceeded/i.test(text)) throw new ProviderFailure("quota");
      throw new ProviderFailure("throttled", retryAfter(response.headers.get("retry-after")));
    }
    if (status >= 500)
      throw new ProviderFailure("unavailable", retryAfter(response.headers.get("retry-after")));
    throw new ProviderFailure("invalid-request");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderFailure("unavailable");
  }
}

const count = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;

export class OpenAICompatibleAdapter implements GatewayAdapter, EmbeddingAdapter {
  readonly id: string;
  private readonly base: string;
  constructor(private readonly config: OpenAICompatibleConfig) {
    this.base = validate(config);
    this.id = config.id;
  }

  async complete(call: AdapterCall, signal: AbortSignal): Promise<AdapterResponse> {
    const body = (await post(
      this.config,
      this.base,
      "/chat/completions",
      {
        model: call.model,
        messages: call.messages,
        max_completion_tokens: call.maxOutputTokens,
        response_format: {
          type: "json_schema",
          json_schema: { name: call.jsonSchema.name, schema: call.jsonSchema.schema, strict: true },
        },
      },
      signal,
    )) as {
      model?: unknown;
      choices?: { message?: { content?: unknown } }[];
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
    };
    const content = body?.choices?.[0]?.message?.content;
    return {
      // A refusal or empty content becomes invalid output and goes through bounded repair.
      text: typeof content === "string" ? content : "",
      reportedModel: typeof body?.model === "string" ? body.model.slice(0, 120) : null,
      usage: body?.usage
        ? {
            inputTokens: count(body.usage.prompt_tokens),
            outputTokens: count(body.usage.completion_tokens),
          }
        : null,
    };
  }

  async embed(input: { model: string; dimensions: number; texts: string[] }, signal: AbortSignal) {
    if (!input.texts.length || input.texts.length > 256)
      throw new ProviderFailure("invalid-request");
    const body = (await post(
      this.config,
      this.base,
      "/embeddings",
      { model: input.model, input: input.texts, dimensions: input.dimensions },
      signal,
    )) as { model?: unknown; data?: { index?: unknown; embedding?: unknown }[] };
    const rows = Array.isArray(body?.data) ? body.data : [];
    const vectors: number[][] = new Array(input.texts.length);
    for (const row of rows) {
      const index = row?.index;
      const vector = row?.embedding;
      if (
        typeof index !== "number" ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= input.texts.length ||
        vectors[index] ||
        !Array.isArray(vector) ||
        vector.length !== input.dimensions ||
        vector.some((value) => typeof value !== "number" || !Number.isFinite(value))
      )
        throw new ProviderFailure("unsupported");
      vectors[index] = vector as number[];
    }
    if (vectors.filter(Boolean).length !== input.texts.length)
      throw new ProviderFailure("unsupported");
    return {
      vectors,
      reportedModel: typeof body?.model === "string" ? body.model.slice(0, 120) : null,
    };
  }
}
