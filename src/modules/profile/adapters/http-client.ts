import { z } from "zod";
import { evidenceSchema, evidencePageSchema, profileSchema, revisionSchema } from "../model";
import { ApplicationError } from "../../platform/errors";
import type { ProfileClient } from "../ports";

/** Interchangeable browser transport. Session cookies are owned by the server. */
export function createHttpProfileClient(fetcher: typeof fetch = fetch): ProfileClient {
  async function request(path: string, method = "GET", body?: unknown) {
    const response = await fetcher(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/v1/${path}`, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      ...(body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
    const json = await response.json();
    if (!response.ok)
      throw new ApplicationError(
        json.error?.code || "RF_UNAVAILABLE",
        response.status,
        json.error?.message || "The profile service is temporarily unavailable.",
      );
    return json;
  }
  const mutation = z.object({ evidence: evidenceSchema, revision: revisionSchema });
  return {
    read: async () => profileSchema.parse((await request("profile")).data),
    update: async (input) => profileSchema.parse((await request("profile", "PATCH", input)).data),
    list: async (query) => {
      const params = new URLSearchParams({ limit: String(query.limit) });
      if (query.skill) params.set("skill", query.skill);
      if (query.cursor) params.set("cursor", query.cursor);
      return evidencePageSchema.parse(await request(`evidence?${params}`));
    },
    history: async (id) =>
      z.array(evidenceSchema).parse((await request(`evidence/${encodeURIComponent(id)}`)).data),
    create: async (input) => mutation.parse((await request("evidence", "POST", input)).data),
    edit: async (id, input) =>
      mutation.parse((await request(`evidence/${encodeURIComponent(id)}`, "PATCH", input)).data),
    remove: async (id, input) =>
      z
        .object({ revision: revisionSchema })
        .parse((await request(`evidence/${encodeURIComponent(id)}`, "DELETE", input)).data),
    importDemo: async (input) =>
      profileSchema.parse((await request("profile/import", "POST", input)).data),
  };
}
