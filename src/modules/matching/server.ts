import "server-only";
import { identityContext } from "../identity/server";
import { MatchingService } from "./service";
import { SupabaseMatchingRepository } from "./adapters/supabase";
import { IdentityWorkerGuard } from "../identity/service";
export async function matchingContext() {
  const identity = await identityContext();
  return {
    actor: await identity.service.currentActor(),
    config: identity.config,
    service: new MatchingService(
      new SupabaseMatchingRepository(identity.client),
      identity.service,
      {
        reserveAnalysis: (actor, input) => identity.service.reserveAnalysis(actor, input),
        // Releasing an unstarted reservation is a trusted server step (service role).
        releaseAnalysis: (taskId) => new IdentityWorkerGuard(identity.privileged()).release(taskId),
      },
    ),
  };
}
