import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeDatabaseError } from "../../platform/database-errors";
import { dictionarySchema, resolutionSchema } from "../model";
import type { SkillRepository, SkillAdminRepository } from "../ports";
async function rpc(client: SupabaseClient, name: string, input?: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, input);
  if (error) throw safeDatabaseError(error);
  return data;
}
export class SupabaseSkillRepository implements SkillRepository {
  constructor(private readonly client: SupabaseClient) {}
  async get(version?: number) {
    return dictionarySchema.parse(
      await rpc(this.client, "dictionary_get", { p_version: version ?? null }),
    );
  }
  async resolve(input: Parameters<SkillRepository["resolve"]>[0]) {
    return resolutionSchema.parse(
      await rpc(this.client, "dictionary_resolve", {
        p_term: input.term,
        p_locale: input.locale ?? null,
        p_version: input.version ?? null,
      }),
    );
  }
}
export class SupabaseSkillAdminRepository implements SkillAdminRepository {
  constructor(private readonly client: SupabaseClient) {}
  private async mutate(name: string, input: Record<string, unknown>) {
    return z
      .object({ version: z.number().int().positive() })
      .parse(await rpc(this.client, name, input));
  }
  create(input: Parameters<SkillAdminRepository["create"]>[0]) {
    const { expectedVersion, reason, ...data } = input;
    return this.mutate("dictionary_create_skill", {
      p_expected: expectedVersion,
      p_data: data,
      p_reason: reason,
    });
  }
  update(id: string, input: Parameters<SkillAdminRepository["update"]>[1]) {
    const { expectedVersion, reason, ...data } = input;
    return this.mutate("dictionary_update_skill", {
      p_id: id,
      p_expected: expectedVersion,
      p_data: data,
      p_reason: reason,
    });
  }
  alias(input: Parameters<SkillAdminRepository["alias"]>[0]) {
    return this.mutate("dictionary_add_alias", {
      p_expected: input.expectedVersion,
      p_skill: input.skillId,
      p_locale: input.locale,
      p_alias: input.alias,
      p_reason: input.reason,
    });
  }
  relation(input: Parameters<SkillAdminRepository["relation"]>[0]) {
    return this.mutate("dictionary_add_relation", {
      p_expected: input.expectedVersion,
      p_parent: input.parentId,
      p_child: input.childId,
      p_relation: input.relation,
      p_reason: input.reason,
    });
  }
  track(input: Parameters<SkillAdminRepository["track"]>[0]) {
    return this.mutate("dictionary_set_track", {
      p_expected: input.expectedVersion,
      p_track: input.track,
      p_skill: input.skillId,
      p_priority: input.priority,
      p_reason: input.reason,
    });
  }
  merge(input: Parameters<SkillAdminRepository["merge"]>[0]) {
    return this.mutate("dictionary_merge_skill", {
      p_expected: input.expectedVersion,
      p_from: input.fromId,
      p_to: input.toId,
      p_reason: input.reason,
    });
  }
  removeAlias(input: Parameters<SkillAdminRepository["removeAlias"]>[0]) {
    return this.mutate("dictionary_remove_alias", {
      p_expected: input.expectedVersion,
      p_locale: input.locale,
      p_alias: input.alias,
      p_reason: input.reason,
    });
  }
  removeRelation(input: Parameters<SkillAdminRepository["removeRelation"]>[0]) {
    return this.mutate("dictionary_remove_relation", {
      p_expected: input.expectedVersion,
      p_parent: input.parentId,
      p_child: input.childId,
      p_relation: input.relation,
      p_reason: input.reason,
    });
  }
  removeTrack(input: Parameters<SkillAdminRepository["removeTrack"]>[0]) {
    return this.mutate("dictionary_remove_track", {
      p_expected: input.expectedVersion,
      p_track: input.track,
      p_skill: input.skillId,
      p_reason: input.reason,
    });
  }
}
