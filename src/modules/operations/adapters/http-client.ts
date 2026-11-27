import { createBrowserTransport } from "../../platform/browser-http";
import {
  operationsSummarySchema,
  operationsTaskSchema,
  operationsTaskPageSchema,
  operationsEventPageSchema,
  operationsWorkersSchema,
} from "../model";
import type { OperationsClient } from "../ports";
export function createOperationsClient(fetcher: typeof fetch = fetch): OperationsClient {
  const request = createBrowserTransport(fetcher),
    base = "admin/operations";
  return {
    summary: async () => operationsSummarySchema.parse((await request(base)).data),
    tasks: async (query) =>
      operationsTaskPageSchema.parse(
        await request(
          `${base}/tasks${Object.keys(query).length ? "?" + new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined) as [string, string][]).toString() : ""}`,
        ),
      ),
    task: async (id) =>
      operationsTaskSchema.parse((await request(`${base}/tasks/${encodeURIComponent(id)}`)).data),
    events: async (id, cursor) =>
      operationsEventPageSchema.parse(
        await request(
          `${base}/tasks/${encodeURIComponent(id)}/events${cursor ? "?cursor=" + encodeURIComponent(cursor) : ""}`,
        ),
      ),
    workers: async () => operationsWorkersSchema.parse((await request(`${base}/workers`)).data),
  };
}
