import "server-only";
import { publicDatabase } from "../platform/public-database";
import { identityContext } from "../identity/server";
import { ApplicationError } from "../platform/errors";
import { SkillDictionaryService, SkillAdministrationService } from "./service";
import { SupabaseSkillRepository, SupabaseSkillAdminRepository } from "./adapters/supabase";
function enabled() {
  if (
    process.env.ROLEFOUNDRY_CATALOG_ENABLED !== "true" &&
    process.env.ROLEFOUNDRY_IDENTITY_ENABLED !== "true"
  )
    throw new ApplicationError("RF_NOT_CONFIGURED", 503, "The dictionary is not configured.");
}
export function publicSkillContext() {
  enabled();
  return new SkillDictionaryService(new SupabaseSkillRepository(publicDatabase()));
}
export async function privateSkillContext() {
  enabled();
  const identity = await identityContext();
  return {
    actor: await identity.service.currentActor(),
    config: identity.config,
    service: new SkillAdministrationService(
      new SupabaseSkillAdminRepository(identity.client),
      identity.service,
    ),
  };
}
