import "server-only";
import { identityContext } from "../identity/server";
import { ImportSubmissionService, ImportAdministrationService } from "./service";
import { FeedAdministrationService } from "./feed-service";
import { deploymentFeedRegistry } from "./adapters/feed-config";
import { SupabaseFeedAdministrationStore } from "./adapters/feed-store";
import { ImportReviewService } from "./review-service";
import { Sha256ImportKey, Sha256ImportDigest } from "./adapters/identity";
import { SupabaseImportRepository } from "./adapters/supabase";
export async function ingestionContext() {
  const identity = await identityContext(),
    store = new SupabaseImportRepository(identity.client);
  return {
    actor: await identity.service.currentActor(),
    config: identity.config,
    submission: new ImportSubmissionService(store, identity.service, new Sha256ImportDigest()),
    admin: new ImportAdministrationService(store, identity.service),
    feeds: new FeedAdministrationService(
      new SupabaseFeedAdministrationStore(identity.client),
      deploymentFeedRegistry(),
      identity.service,
    ),
    review: new ImportReviewService(store, identity.service, new Sha256ImportKey()),
  };
}
