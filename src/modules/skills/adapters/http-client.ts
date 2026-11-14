import { z } from "zod";
import { createBrowserTransport } from "../../platform/browser-http";
import { dictionarySchema, resolutionSchema } from "../model";
import type { SkillClient, SkillAdminClient } from "../ports";
export function createSkillClient(fetcher: typeof fetch = fetch): SkillClient {
  const request = createBrowserTransport(fetcher);
  return {
    get: async (version) =>
      dictionarySchema.parse((await request(`skills${version ? `?version=${version}` : ""}`)).data),
    resolve: async (input) =>
      resolutionSchema.parse(
        (
          await request(
            `skills/resolve?${new URLSearchParams(
              Object.entries(input)
                .filter(([, v]) => v !== undefined)
                .map(([k, v]) => [k, String(v)]),
            )}`,
          )
        ).data,
      ),
  };
}
export function createSkillAdminClient(fetcher: typeof fetch = fetch): SkillAdminClient {
  const request = createBrowserTransport(fetcher);
  const send = async (path: string, body: unknown, method = "POST") =>
    z
      .object({ version: z.number().int().positive() })
      .parse((await request(`admin/skills${path}`, { method, body })).data);
  return {
    removeAlias: (input) => send("/aliases", input, "DELETE"),
    removeRelation: (input) => send("/relations", input, "DELETE"),
    removeTrack: (input) => send("/tracks", input, "DELETE"),
    create: (input) => send("", input),
    update: (id, input) => send(`/${encodeURIComponent(id)}`, input, "PATCH"),
    alias: (input) => send("/aliases", input),
    relation: (input) => send("/relations", input),
    track: (input) => send("/tracks", input),
    merge: (input) => send("/merge", input),
  };
}
