import "server-only";
import { identityContext } from "../identity/server";
import { OperationsService } from "./service";
import { SupabaseOperationsReadStore } from "./adapters/supabase";
import { TaskReplayService } from "./replay";
import { SupabaseTaskReplayStore } from "./adapters/replay-store";
import { deploymentFeedRegistry } from "../ingestion/adapters/feed-config";
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

export async function taskReplayContext() {
  const identity = await identityContext();
  return {
    actor: await identity.service.currentActor(),
    config: identity.config,
    replay: new TaskReplayService(new SupabaseTaskReplayStore(identity.client), identity.service, {
      allows: (feed) =>
        deploymentFeedRegistry().find(feed.id, feed.kind)?.revision === feed.revision,
    }),
  };
}
