import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IdentityAnalysisLifecycle } from "../../gateway/adapters/identity-lifecycle";
import { AIGateway } from "../../gateway/service";
import type { GatewayRecorder } from "../../gateway/ports";
import { gatewayTemplates, rankSpec } from "../../gateway/recipes";
import { parseGatewayPolicy } from "../../gateway/policy";
import { adaptersFromEnvironment } from "../../gateway/adapters/registry";
import {
  SupabaseGatewayAuthority,
  SupabaseGatewayRecorder,
  SupabaseProviderBudgets,
  SupabaseProviderSlots,
} from "../../gateway/adapters/supabase";
import type { SemanticStage } from "../handler";
import type { SemanticRankingStore } from "../ports";
import { SemanticRanker, type SemanticGateway } from "../semantic";

export { IdentityAnalysisLifecycle };

/** Binds the gateway's ranking recipe and durable recorder to the matching port. */
export class GatewaySemanticRanking implements SemanticGateway {
  constructor(
    private readonly gateway: AIGateway,
    private readonly recorder: GatewayRecorder,
  ) {}
  rank(request: Parameters<SemanticGateway["rank"]>[0], signal: AbortSignal) {
    return this.gateway.execute(request, rankSpec, signal);
  }
  record(result: Parameters<SemanticGateway["record"]>[0], signal: AbortSignal) {
    return this.recorder.record(result, signal);
  }
}

/**
 * Worker composition. An invalid policy fails startup; a policy without a ranking route leaves
 * the stage present but gateway-less, so reservations are released and reports say why.
 */
export function semanticStageFromEnvironment(
  client: SupabaseClient,
  store: SemanticRankingStore,
  env: Record<string, string | undefined> = process.env,
): SemanticStage {
  const policy = parseGatewayPolicy(env.ROLEFOUNDRY_AI_POLICY);
  const enabled = Boolean(policy.routes["matching.semantic-rank"]);
  const gateway = enabled
    ? new GatewaySemanticRanking(
        new AIGateway({
          policy,
          adapters: adaptersFromEnvironment(env),
          templates: gatewayTemplates,
          authority: new SupabaseGatewayAuthority(client),
          slots: new SupabaseProviderSlots(client),
          budgets: new SupabaseProviderBudgets(client),
        }),
        new SupabaseGatewayRecorder(client),
      )
    : null;
  return { store, ranker: new SemanticRanker(new IdentityAnalysisLifecycle(client), gateway) };
}
