import "server-only";
import { createClient } from "@supabase/supabase-js";
import { identityContext } from "../identity/server";
import { AccountDataService } from "./service";
import { SupabaseAccountExports } from "./adapters/supabase";
import { SupabaseAccountArchiveStorage } from "./adapters/storage";
import { ZipAccountArchive } from "./adapters/archive";
export async function accountDataContext() {
  const identity = await identityContext();
  const storageClient = createClient(identity.config.url, identity.config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.any([
            ...(init?.signal ? [init.signal] : []),
            AbortSignal.timeout(10000),
          ]),
        }),
    },
  });
  return {
    actor: await identity.service.currentActor(),
    origin: identity.config.appOrigin,
    service: new AccountDataService(new SupabaseAccountExports(identity.client), identity.service),
    storage: new SupabaseAccountArchiveStorage(storageClient),
    archive: new ZipAccountArchive(),
  };
}
