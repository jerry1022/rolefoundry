import { z } from "zod";
import { createBrowserTransport } from "../../platform/browser-http";
import {
  invitationReceiptSchema,
  invitationPageSchema,
  quotaPageSchema,
  type IdentityAdminClient,
} from "../admin";
export function createIdentityAdminClient(fetcher: typeof fetch = fetch): IdentityAdminClient {
  const request = createBrowserTransport(fetcher),
    base = "identity/admin";
  return {
    invite: async (input) =>
      invitationReceiptSchema.parse(
        (await request(`${base}/invitations`, { method: "POST", body: input })).data,
      ),
    invitations: async (cursor) =>
      invitationPageSchema.parse(
        await request(
          `${base}/invitations${cursor ? "?cursor=" + encodeURIComponent(cursor) : ""}`,
        ),
      ),
    revokeInvitation: async (id) => {
      await request(`${base}/invitations/${encodeURIComponent(id)}/revoke`, {
        method: "POST",
        body: {},
      });
    },
    quotaPolicies: async (cursor) =>
      quotaPageSchema.parse(
        await request(
          `${base}/quota-policies${cursor ? "?cursor=" + encodeURIComponent(cursor) : ""}`,
        ),
      ),
    scheduleQuota: async (input) =>
      z
        .object({ effectiveFrom: z.iso.datetime({ offset: true }) })
        .parse((await request(`${base}/quota-policies`, { method: "POST", body: input })).data),
    refund: async (input) => {
      await request(`${base}/refunds`, { method: "POST", body: input });
    },
  };
}
