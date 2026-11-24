import "server-only";
import { CourseLinkAdminService } from "../course-links/admin";
import { SupabaseCourseLinkAdmin } from "../course-links/adapters/supabase";
import { identityContext } from "../identity/server";
import { publicDatabase } from "../platform/public-database";
import { ApplicationError } from "../platform/errors";
import { CourseCatalogService, LearningService, LearningAdministrationService } from "./service";
import {
  SupabaseCourseCatalog,
  SupabaseLearningRepository,
  SupabaseLearningAdministration,
} from "./adapters/supabase";
function configured() {
  if (process.env.ROLEFOUNDRY_CATALOG_ENABLED !== "true")
    throw new ApplicationError("RF_NOT_CONFIGURED", 503, "The course catalog is not configured.");
}
export function publicLearningContext() {
  configured();
  return new CourseCatalogService(new SupabaseCourseCatalog(publicDatabase()));
}
export async function privateLearningContext() {
  configured();
  const identity = await identityContext();
  return {
    actor: await identity.service.currentActor(),
    config: identity.config,
    links: new CourseLinkAdminService(
      new SupabaseCourseLinkAdmin(identity.client),
      identity.service,
    ),
    service: new LearningService(new SupabaseLearningRepository(identity.client), identity.service),
    admin: new LearningAdministrationService(
      new SupabaseLearningAdministration(identity.client),
      identity.service,
    ),
  };
}
