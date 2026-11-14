import "server-only";
import { publicDatabase } from "../platform/public-database";
import { ApplicationError } from "../platform/errors";
import { identityContext } from "../identity/server";
import { JobCatalogService, BookmarkService, CatalogAdminService } from "./service";
import {
  SupabaseCatalogRepository,
  SupabaseBookmarkRepository,
  SupabaseCatalogAdminRepository,
} from "./adapters/supabase";
function configured() {
  if (process.env.ROLEFOUNDRY_CATALOG_ENABLED !== "true")
    throw new ApplicationError(
      "RF_NOT_CONFIGURED",
      503,
      "The catalog is not configured for this deployment.",
    );
}
export function publicCatalogContext() {
  configured();
  return new JobCatalogService(new SupabaseCatalogRepository(publicDatabase()));
}
export async function privateCatalogContext() {
  configured();
  const identity = await identityContext();
  const actor = await identity.service.currentActor();
  return {
    actor,
    config: identity.config,
    bookmarks: new BookmarkService(
      new SupabaseBookmarkRepository(identity.client, actor.userId),
      identity.service,
    ),
    admin: new CatalogAdminService(
      new SupabaseCatalogAdminRepository(identity.client),
      identity.service,
    ),
  };
}
