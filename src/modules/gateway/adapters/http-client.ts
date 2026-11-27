import { createBrowserTransport } from "../../platform/browser-http";
import {
  recipientChangeSchema,
  recipientPageSchema,
  type RecipientChange,
  type RecipientPage,
} from "../admin";
import { usageReportSchema, type UsageReport, type UsageWindow } from "../usage";

export interface RecipientClient {
  list(signal?: AbortSignal): Promise<RecipientPage>;
  approve(change: RecipientChange): Promise<void>;
  revoke(change: RecipientChange): Promise<void>;
}

export function createRecipientClient(fetcher: typeof fetch = fetch): RecipientClient {
  const request = createBrowserTransport(fetcher);
  const path = "identity/admin/ai-recipients";
  return {
    list: async (signal) => recipientPageSchema.parse((await request(path, { signal })).data),
    async approve(change) {
      await request(path, { method: "POST", body: recipientChangeSchema.parse(change) });
    },
    async revoke(change) {
      await request(path, { method: "DELETE", body: recipientChangeSchema.parse(change) });
    },
  };
}

export interface UsageClient {
  report(windowDays: UsageWindow, signal?: AbortSignal): Promise<UsageReport>;
}

export function createUsageClient(fetcher: typeof fetch = fetch): UsageClient {
  const request = createBrowserTransport(fetcher);
  return {
    report: async (windowDays, signal) =>
      usageReportSchema.parse(
        (await request(`identity/admin/ai-usage?days=${windowDays}`, { signal })).data,
      ),
  };
}
