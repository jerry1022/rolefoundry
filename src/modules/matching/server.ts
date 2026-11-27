import "server-only";
import { identityContext } from "../identity/server";
import { MatchingService } from "./service";
import { SupabaseMatchingRepository } from "./adapters/supabase";
export async function matchingContext() {
  const identity = await identityContext();
  return {
    actor: await identity.service.currentActor(),
    config: identity.config,
    service: new MatchingService(new SupabaseMatchingRepository(identity.client), identity.service),
  };
}
