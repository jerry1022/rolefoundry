import { createBrowserTransport } from "../../platform/browser-http";
import { matchRunSchema, matchTaskSchema, matchHistorySchema } from "../model";
import type { MatchingClient } from "../ports";
export function createMatchingClient(fetcher: typeof fetch = fetch): MatchingClient {
  const request = createBrowserTransport(fetcher);
  return {
    refresh: async (input, key) =>
      matchTaskSchema.parse(
        (await request("matches", { method: "POST", body: input, idempotencyKey: key })).data,
      ),
    find: async (id, cursor) =>
      matchRunSchema.parse(
        (
          await request(
            `matches/${encodeURIComponent(id)}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
          )
        ).data,
      ),
    list: async (cursor) =>
      matchHistorySchema.parse(
        await request(`matches${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
      ),
  };
}
