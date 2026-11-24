import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { wordingSpec } from "../../gateway/recipes";
import { IdentityAnalysisLifecycle } from "../../gateway/adapters/identity-lifecycle";
import type { GatewayRuntime } from "../../gateway/adapters/runtime";
import type { WordingStageDependencies } from "../handler";
import type { ResumeWordingStore } from "../ports";
import { WordingStage } from "../wording";

/**
 * Worker composition. Without a `resume.wording` route the stage stays present but
 * gateway-less, so reservations are released and proposals say why.
 */
export function wordingStage(
  client: SupabaseClient,
  store: ResumeWordingStore,
  runtime: GatewayRuntime,
): WordingStageDependencies {
  const gateway = runtime.enabled("resume.wording") ? runtime.gateway : null;
  return {
    store,
    stage: new WordingStage(
      new IdentityAnalysisLifecycle(client),
      gateway && {
        run: (request, signal) => gateway.execute(request, wordingSpec, signal),
        record: (result, signal) => runtime.recorder.record(result, signal),
      },
    ),
  };
}
