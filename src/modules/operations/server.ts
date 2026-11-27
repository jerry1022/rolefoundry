import "server-only";
import { identityContext } from "../identity/server";
import { OperationsService } from "./service";
import { SupabaseOperationsReadStore } from "./adapters/supabase";
export async function operationsContext() {
  const identity = await identityContext();
  return {
    actor: await identity.service.currentActor(),
    service: new OperationsService(
      new SupabaseOperationsReadStore(identity.client),
      identity.service,
    ),
  };
}
