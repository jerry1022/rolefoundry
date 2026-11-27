import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIGateway } from "../../gateway/service";
import type { GatewayRecorder } from "../../gateway/ports";
import { rankSpec } from "../../gateway/recipes";
import { IdentityAnalysisLifecycle } from "../../gateway/adapters/identity-lifecycle";
import type { GatewayRuntime } from "../../gateway/adapters/runtime";
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
 * Worker composition. Without a `matching.semantic-rank` route the stage stays present but
 * gateway-less, so reservations are released and reports say why.
 */
export function semanticStage(
  client: SupabaseClient,
  store: SemanticRankingStore,
  runtime: GatewayRuntime,
): SemanticStage {
  const gateway =
    runtime.gateway && runtime.enabled("matching.semantic-rank")
      ? new GatewaySemanticRanking(runtime.gateway, runtime.recorder)
      : null;
  return { store, ranker: new SemanticRanker(new IdentityAnalysisLifecycle(client), gateway) };
}
