import { createBrowserTransport } from "../../platform/browser-http";
import { replayPreviewSchema, replayResultSchema, type TaskReplayClient } from "../replay";
export function createTaskReplayClient(fetcher: typeof fetch = fetch): TaskReplayClient {
  const request = createBrowserTransport(fetcher),
    path = (id: string) => `admin/operations/tasks/${encodeURIComponent(id)}/replay`;
  return {
    preview: async (id) => replayPreviewSchema.parse((await request(path(id))).data),
    request: async (id, input) =>
      replayResultSchema.parse((await request(path(id), { method: "POST", body: input })).data),
  };
}
