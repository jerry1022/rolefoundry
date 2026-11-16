import "server-only";
import { createClient } from "@supabase/supabase-js";
import { identityContext } from "../identity/server";
import { ResumeService } from "./service";
import { SupabaseResumeRepository } from "./adapters/repository";
import { SupabaseResumeStorage, Sha256ResumeDigest } from "./adapters/storage";
export async function resumeContext(signal?: AbortSignal) {
  const identity = await identityContext(),
    actor = await identity.service.currentActor();
  const privileged = createClient(identity.config.url, identity.config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.any([
            ...(init?.signal ? [init.signal] : []),
            ...(signal ? [signal] : []),
            AbortSignal.timeout(10000),
          ]),
        }),
    },
  });
  return {
    actor,
    config: identity.config,
    service: new ResumeService(
      new SupabaseResumeRepository(identity.client, privileged, actor.userId),
      new SupabaseResumeStorage(privileged),
      new Sha256ResumeDigest(),
      identity.service,
    ),
  };
}
