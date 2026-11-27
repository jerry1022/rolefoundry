import "server-only";
import { identityContext } from "../identity/server";
import { AccountDeletionService } from "./service";
import { SupabaseDeletionRepository } from "./adapters/supabase";
export async function deletionContext() {
  const identity = await identityContext();
  return {
    identity,
    service: new AccountDeletionService(
      new SupabaseDeletionRepository(identity.client),
      identity.service,
    ),
  };
}
