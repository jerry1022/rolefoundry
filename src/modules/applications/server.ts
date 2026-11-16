import "server-only";
import { identityContext } from "../identity/server";
import { ApplicationService } from "./service";
import { SupabaseApplicationRepository } from "./adapters/supabase";
export async function applicationContext() {
  const identity = await identityContext();
  return {
    actor: await identity.service.currentActor(),
    config: identity.config,
    service: new ApplicationService(
      new SupabaseApplicationRepository(identity.client),
      identity.service,
    ),
  };
}
