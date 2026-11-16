import { z } from "zod";
import { createBrowserTransport } from "../../platform/browser-http";
import {
  applicationSchema,
  applicationPageSchema,
  eventPageSchema,
  resumeChoicePageSchema,
} from "../model";
import type { ApplicationClient } from "../ports";
export function createApplicationClient(fetcher: typeof fetch = fetch): ApplicationClient {
  const request = createBrowserTransport(fetcher),
    path = (id: string) => `applications/${encodeURIComponent(id)}`;
  const send = async (url: string, method: string, body: unknown, idempotencyKey?: string) =>
    applicationSchema.parse(
      (await request(url, { method, body, idempotencyKey, signal: AbortSignal.timeout(15000) }))
        .data,
    );
  const query = (cursor?: string) => (cursor ? `?cursor=${encodeURIComponent(cursor)}` : "");
  return {
    resumeChoices: async (cursor) =>
      resumeChoicePageSchema.parse(
        await request(`applications/resume-choices${query(cursor)}`, {
          signal: AbortSignal.timeout(15000),
        }),
      ),
    list: async (cursor) =>
      applicationPageSchema.parse(
        await request(`applications${query(cursor)}`, { signal: AbortSignal.timeout(15000) }),
      ),
    find: async (id) =>
      applicationSchema.parse(
        (await request(path(id), { signal: AbortSignal.timeout(15000) })).data,
      ),
    events: async (id, cursor) =>
      eventPageSchema.parse(
        await request(`${path(id)}/events${query(cursor)}`, { signal: AbortSignal.timeout(15000) }),
      ),
    track: (input, key) => send("applications", "POST", input, key),
    edit: (id, input) => send(path(id), "PATCH", input),
    newCycle: (id, expectedRevision, key) =>
      send(`${path(id)}/new-cycle`, "POST", { expectedRevision }, key),
    addFollowUp: (id, input, key) => send(`${path(id)}/follow-ups`, "POST", input, key),
    editFollowUp: (id, followUpId, input) =>
      send(`${path(id)}/follow-ups/${encodeURIComponent(followUpId)}`, "PATCH", input),
    removeFollowUp: (id, followUpId, expectedRevision) =>
      send(`${path(id)}/follow-ups/${encodeURIComponent(followUpId)}`, "DELETE", {
        expectedRevision,
      }),
    remove: async (id, expectedRevision) =>
      z
        .object({ deleted: z.literal(true) })
        .parse((await request(path(id), { method: "DELETE", body: { expectedRevision } })).data),
  };
}
