import "server-only";
import { identityContext } from "../identity/server";
import { ProfileService } from "./service";
import { SupabaseProfileRepository } from "./adapters/supabase";

/** Composition root: provider-specific wiring stays outside domain use cases and UI. */
export async function profileContext() {
  const identity = await identityContext();
  const actor = await identity.service.currentActor();
  return {
    actor,
    config: identity.config,
    service: new ProfileService(new SupabaseProfileRepository(identity.client), identity.service),
  };
}
