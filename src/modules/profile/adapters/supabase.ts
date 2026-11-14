import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApplicationError } from "../../platform/errors";
import {
  evidencePageSchema,
  evidenceSchema,
  internalEvidenceSchema,
  profileSchema,
  ProfileError,
  revisionSchema,
} from "../model";
import type { ProfileRepository, InternalEvidenceWriter } from "../ports";

const mutationSchema = z.object({ evidence: evidenceSchema, revision: revisionSchema });
async function rpc(client: SupabaseClient, name: string, input?: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, input);
  if (error) {
    const statuses = {
      RF_INVALID_INPUT: 400,
      RF_CONFLICT: 409,
      RF_NOT_FOUND: 404,
      RF_FORBIDDEN: 403,
      RF_UNAVAILABLE: 503,
    } as const;
    const code = error.message as keyof typeof statuses;
    if (Object.hasOwn(statuses, code)) throw new ProfileError(code, statuses[code]);
    if (error.message === "RF_UNAUTHORIZED")
      throw new ApplicationError("RF_UNAUTHORIZED", 401, "Sign in to continue.");
    if (error.code === "42501") throw new ProfileError("RF_FORBIDDEN", 403);
    throw new ProfileError("RF_UNAVAILABLE", 503);
  }
  return data;
}
const cursorSchema = z
  .object({ after: z.uuid(), revision: revisionSchema, skill: z.string().nullable() })
  .strict();
export class SupabaseProfileRepository implements ProfileRepository {
  constructor(private readonly client: SupabaseClient) {}
  async read() {
    return profileSchema.parse(await rpc(this.client, "profile_read"));
  }
  async update(input: Parameters<ProfileRepository["update"]>[0]) {
    const { expectedRevision, ...preferences } = input;
    return profileSchema.parse(
      await rpc(this.client, "profile_update", {
        p_expected: expectedRevision,
        p_data: preferences,
      }),
    );
  }
  async list(query: Parameters<ProfileRepository["list"]>[0]) {
    let cursor: z.infer<typeof cursorSchema> | undefined;
    if (query.cursor) {
      try {
        cursor = cursorSchema.parse(
          JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8")),
        );
      } catch {
        throw new ProfileError("RF_INVALID_INPUT", 400);
      }
      if (cursor.skill !== (query.skill || null)) throw new ProfileError("RF_INVALID_INPUT", 400);
    }
    const result = z
      .object({
        data: z.array(evidenceSchema),
        lastId: z.uuid().nullable(),
        revision: revisionSchema,
      })
      .parse(
        await rpc(this.client, "profile_list_evidence", {
          p_skill: query.skill || null,
          p_after: cursor?.after || null,
          p_revision: cursor?.revision ?? null,
          p_limit: query.limit,
        }),
      );
    return evidencePageSchema.parse({
      data: result.data,
      revision: result.revision,
      nextCursor: result.lastId
        ? Buffer.from(
            JSON.stringify({
              after: result.lastId,
              revision: result.revision,
              skill: query.skill || null,
            }),
          ).toString("base64url")
        : null,
    });
  }
  async history(id: string) {
    return z
      .array(evidenceSchema)
      .parse(await rpc(this.client, "profile_evidence_history", { p_id: id }));
  }
  async create(input: Parameters<ProfileRepository["create"]>[0]) {
    return mutationSchema.parse(
      await rpc(this.client, "profile_create_evidence", {
        p_expected: input.expectedRevision,
        p_data: input.evidence,
      }),
    );
  }
  async edit(id: string, input: Parameters<ProfileRepository["edit"]>[1]) {
    return mutationSchema.parse(
      await rpc(this.client, "profile_edit_evidence", {
        p_id: id,
        p_expected: input.expectedRevision,
        p_version: input.expectedVersion,
        p_data: input.evidence,
      }),
    );
  }
  async remove(id: string, input: Parameters<ProfileRepository["remove"]>[1]) {
    return z.object({ revision: revisionSchema }).parse(
      await rpc(this.client, "profile_delete_evidence", {
        p_id: id,
        p_expected: input.expectedRevision,
        p_version: input.expectedVersion,
      }),
    );
  }
  async importDemo(input: Parameters<ProfileRepository["importDemo"]>[0]) {
    return profileSchema.parse(
      await rpc(this.client, "profile_import_demo", {
        p_expected: input.expectedRevision,
        p_preferences: input.preferences,
        p_skills: input.skills,
      }),
    );
  }
}
export class SupabaseInternalEvidenceWriter implements InternalEvidenceWriter {
  constructor(private readonly privileged: SupabaseClient) {}
  async record(ownerId: string, input: Parameters<InternalEvidenceWriter["record"]>[1]) {
    return mutationSchema.parse(
      await rpc(this.privileged, "profile_record_internal_evidence", {
        p_user: z.uuid().parse(ownerId),
        p_data: internalEvidenceSchema.parse(input),
      }),
    );
  }
}
