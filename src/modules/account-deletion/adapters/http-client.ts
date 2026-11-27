import { createBrowserTransport } from "../../platform/browser-http";
import { deletionStatusSchema } from "../model";
import type { DeletionClient, DeletionAdminClient } from "../ports";
export function createDeletionClient(fetcher: typeof fetch = fetch): DeletionClient {
  const request = createBrowserTransport(fetcher);
  return {
    request: async (input) =>
      deletionStatusSchema.parse(
        (await request("account/deletion", { method: "POST", body: input })).data,
      ),
    status: async (receipt) =>
      deletionStatusSchema.parse(
        (await request("account/deletion/status", { method: "POST", body: receipt })).data,
      ),
  };
}
export function createDeletionAdminClient(fetcher: typeof fetch = fetch): DeletionAdminClient {
  const request = createBrowserTransport(fetcher),
    base = "admin/account-deletions";
  return {
    find: async (id) =>
      deletionStatusSchema.parse((await request(`${base}/tasks/${encodeURIComponent(id)}`)).data),
    resume: async (id, reason) =>
      deletionStatusSchema.parse(
        (
          await request(`${base}/${encodeURIComponent(id)}/resume`, {
            method: "POST",
            body: { reason },
          })
        ).data,
      ),
  };
}
