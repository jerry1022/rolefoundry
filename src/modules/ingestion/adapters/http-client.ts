import { z } from "zod";
import { createBrowserTransport } from "../../platform/browser-http";
import {
  importSettingSchema,
  importSourceSchema,
  importTaskReplySchema,
  importBatchSchema,
  importBatchSummarySchema,
  importReviewSchema,
  importReceiptSchema,
} from "../model";
import type { ImportAdminClient } from "../ports";
/** Browser transport is replaceable; the screen only depends on ImportAdminClient. */
export function createImportAdminClient(fetcher: typeof fetch = fetch): ImportAdminClient {
  const request = createBrowserTransport(fetcher),
    base = "admin/imports",
    review = (id: string) => `${base}/reviews/${encodeURIComponent(id)}`;
  return {
    registerJobSource: async (input) =>
      z
        .object({ id: z.uuid() })
        .parse((await request("admin/catalog/sources", { method: "POST", body: input })).data),
    settings: async () =>
      z.array(importSettingSchema).parse((await request(`${base}/sources`)).data),
    configure: async (id, input) =>
      importSourceSchema.parse(
        (
          await request(`${base}/sources/${encodeURIComponent(id)}`, {
            method: "PATCH",
            body: input,
          })
        ).data,
      ),
    submit: async (input, key) =>
      importTaskReplySchema.parse(
        (await request(base, { method: "POST", body: input, idempotencyKey: key })).data,
      ),
    list: async (cursor) =>
      z
        .object({ data: z.array(importBatchSummarySchema), nextCursor: z.string().nullable() })
        .parse(await request(`${base}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`)),
    find: async (id) =>
      importBatchSchema.parse((await request(`${base}/${encodeURIComponent(id)}`)).data),
    review: async (id) => importReviewSchema.parse((await request(review(id))).data),
    rebase: async (id, input) =>
      importReviewSchema.parse(
        (await request(`${review(id)}/rebase`, { method: "POST", body: input })).data,
      ),
    decide: async (id, input, key) =>
      importReceiptSchema.parse(
        (
          await request(`${review(id)}/decide`, {
            method: "POST",
            body: input,
            idempotencyKey: key,
          })
        ).data,
      ),
  };
}
