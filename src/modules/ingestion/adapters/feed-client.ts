import { z } from "zod";
import { createBrowserTransport } from "../../platform/browser-http";
import { feedSettingSchema, feedRunSchema, approvedFeedOptionSchema } from "../model";
import type { FeedAdminClient } from "../ports";
export function createFeedAdminClient(fetcher: typeof fetch = fetch): FeedAdminClient {
  const request = createBrowserTransport(fetcher),
    base = "admin/imports";
  return {
    settings: async () =>
      z
        .object({
          settings: z.array(feedSettingSchema),
          definitions: z.array(approvedFeedOptionSchema),
        })
        .parse((await request(`${base}/feeds`)).data),
    configure: async (id, input) =>
      feedSettingSchema.parse(
        (await request(`${base}/feeds/${encodeURIComponent(id)}`, { method: "PATCH", body: input }))
          .data,
      ),
    request: async (id, key) =>
      feedRunSchema.parse(
        (
          await request(`${base}/feeds/${encodeURIComponent(id)}/fetch`, {
            method: "POST",
            body: {},
            idempotencyKey: key,
          })
        ).data,
      ),
    find: async (id) =>
      feedRunSchema.parse((await request(`${base}/feed-runs/${encodeURIComponent(id)}`)).data),
    list: async () => z.array(feedRunSchema).parse((await request(`${base}/feed-runs`)).data),
  };
}
