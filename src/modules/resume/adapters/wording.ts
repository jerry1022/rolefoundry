import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AIGateway } from "../../gateway/service";
import { parseGatewayPolicy } from "../../gateway/policy";
import { gatewayTemplates, wordingSpec } from "../../gateway/recipes";
import { adaptersFromEnvironment } from "../../gateway/adapters/registry";
import { IdentityAnalysisLifecycle } from "../../gateway/adapters/identity-lifecycle";
import {
  SupabaseGatewayAuthority,
  SupabaseGatewayRecorder,
  SupabaseProviderBudgets,
  SupabaseProviderSlots,
} from "../../gateway/adapters/supabase";
import type { WordingStageDependencies } from "../handler";
import type { ResumeWordingStore } from "../ports";
import { WordingStage } from "../wording";

/**
 * Worker composition. An invalid policy fails startup; without a `resume.wording` route the
 * stage stays present but gateway-less, so reservations are released and proposals say why.
 */
export function wordingStageFromEnvironment(
  client: SupabaseClient,
  store: ResumeWordingStore,
  env: Record<string, string | undefined> = process.env,
): WordingStageDependencies {
  const policy = parseGatewayPolicy(env.ROLEFOUNDRY_AI_POLICY);
  const gateway = policy.routes["resume.wording"]
    ? new AIGateway({
        policy,
        adapters: adaptersFromEnvironment(env),
        templates: gatewayTemplates,
        authority: new SupabaseGatewayAuthority(client),
        slots: new SupabaseProviderSlots(client),
        budgets: new SupabaseProviderBudgets(client),
      })
    : null;
  const recorder = new SupabaseGatewayRecorder(client);
  return {
    store,
    stage: new WordingStage(
      new IdentityAnalysisLifecycle(client),
      gateway && {
        run: (request, signal) => gateway.execute(request, wordingSpec, signal),
        record: (result, signal) => recorder.record(result, signal),
      },
    ),
  };
}
