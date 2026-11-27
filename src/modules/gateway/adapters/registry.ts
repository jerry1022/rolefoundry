import type { GatewayAdapter } from "../ports";
import { OpenAICompatibleAdapter } from "./openai-compatible";

/**
 * Builds provider adapters from server/worker-only settings. A provider is present only when
 * its own key is set; keys are never shared between providers or exposed to the browser.
 */
export function adaptersFromEnvironment(env: Record<string, string | undefined>) {
  const adapters: GatewayAdapter[] = [];
  if (env.OPENAI_API_KEY)
    adapters.push(
      new OpenAICompatibleAdapter({
        id: "openai",
        baseUrl: env.ROLEFOUNDRY_OPENAI_BASE_URL || "https://api.openai.com/v1",
        auth: "bearer",
        apiKey: env.OPENAI_API_KEY,
      }),
    );
  if (env.LUNAROUTE_API_KEY) {
    // No default: the exact gateway base path must be confirmed against the provider docs.
    if (!env.ROLEFOUNDRY_LUNAROUTE_BASE_URL)
      throw new Error("LunaRoute base URL must be configured explicitly.");
    adapters.push(
      new OpenAICompatibleAdapter({
        id: "lunaroute",
        baseUrl: env.ROLEFOUNDRY_LUNAROUTE_BASE_URL,
        auth: "lunaroute-key",
        apiKey: env.LUNAROUTE_API_KEY,
      }),
    );
  }
  return adapters;
}
