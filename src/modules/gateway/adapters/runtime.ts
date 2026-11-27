import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AIGateway } from "../service";
import { parseGatewayPolicy } from "../policy";
import { gatewayTemplates } from "../recipes";
import type { GatewayPurpose } from "../model";
import type { GatewayRecorder } from "../ports";
import { adaptersFromEnvironment } from "./registry";
import {
  SupabaseGatewayAuthority,
  SupabaseGatewayRecorder,
  SupabaseProviderBudgets,
  SupabaseProviderSlots,
} from "./supabase";

/** One gateway per worker process, so per-adapter concurrency is shared across purposes. */
export interface GatewayRuntime {
  gateway: AIGateway | null;
  recorder: GatewayRecorder;
  enabled(purpose: GatewayPurpose): boolean;
}

/** An invalid policy fails startup; an empty policy yields a runtime with every purpose off. */
export function gatewayRuntimeFromEnvironment(
  client: SupabaseClient,
  env: Record<string, string | undefined> = process.env,
): GatewayRuntime {
  const policy = parseGatewayPolicy(env.ROLEFOUNDRY_AI_POLICY);
  const gateway = Object.keys(policy.routes).length
    ? new AIGateway({
        policy,
        adapters: adaptersFromEnvironment(env),
        templates: gatewayTemplates,
        authority: new SupabaseGatewayAuthority(client),
        slots: new SupabaseProviderSlots(client),
        budgets: new SupabaseProviderBudgets(client),
      })
    : null;
  return {
    gateway,
    recorder: new SupabaseGatewayRecorder(client),
    enabled: (purpose) => Boolean(gateway && policy.routes[purpose]),
  };
}
