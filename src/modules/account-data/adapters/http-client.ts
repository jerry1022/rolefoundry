import { createBrowserTransport } from "../../platform/browser-http";
import { ApplicationError } from "../../platform/errors";
import { accountExportSchema, accountExportPageSchema } from "../model";
import type { AccountDataClient } from "../ports";
export function createAccountDataClient(fetcher: typeof fetch = fetch): AccountDataClient {
  const request = createBrowserTransport(fetcher),
    base = "account/exports";
  return {
    remove: async (id) =>
      accountExportSchema.parse(
        (await request(`${base}/${encodeURIComponent(id)}`, { method: "DELETE", body: {} })).data,
      ),
    request: async (key) =>
      accountExportSchema.parse(
        (await request(base, { method: "POST", body: {}, idempotencyKey: key })).data,
      ),
    list: async (cursor) =>
      accountExportPageSchema.parse(
        await request(`${base}${cursor ? "?cursor=" + encodeURIComponent(cursor) : ""}`),
      ),
    download: async (id) => {
      const response = await fetcher(
        `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/v1/${base}/${encodeURIComponent(id)}/download`,
        { credentials: "same-origin", cache: "no-store" },
      );
      if (!response.ok) {
        const body = await response.json();
        throw new ApplicationError(
          body.error?.code || "RF_UNAVAILABLE",
          response.status,
          body.error?.message || "The private archive is unavailable.",
        );
      }
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}
