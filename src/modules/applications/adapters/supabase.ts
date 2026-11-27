import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApplicationRepository } from "../ports";
import {
  applicationSchema,
  applicationPageSchema,
  eventPageSchema,
  resumeChoicePageSchema,
} from "../model";
import { safeDatabaseError } from "../../platform/database-errors";
import { ApplicationError } from "../../platform/errors";
function decode(cursor?: string) {
  if (!cursor) return null;
  try {
    return z
      .string()
      .regex(/^[1-9]\d{0,18}$/)
      .refine((value) => BigInt(value) <= 9223372036854775807n)
      .parse(JSON.parse(Buffer.from(cursor, "base64url").toString()));
  } catch {
    throw new ApplicationError("RF_INVALID_INPUT", 400, "The history cursor is invalid.");
  }
}
function encode(value: string | null) {
  return value ? Buffer.from(JSON.stringify(value)).toString("base64url") : null;
}
export class SupabaseApplicationRepository implements ApplicationRepository {
  constructor(private readonly client: SupabaseClient) {}
  private async rpc(name: string, args: Record<string, unknown> = {}) {
    const { data, error } = await this.client
      .rpc(name, args)
      .abortSignal(AbortSignal.timeout(10000));
    if (error) throw safeDatabaseError(error);
    return data;
  }
  async list(cursor?: string) {
    const raw = await this.rpc("application_list", { p_before: decode(cursor) });
    return applicationPageSchema.parse({
      ownerId: raw.ownerId,
      data: raw.data,
      nextCursor: encode(raw.lastSequence),
    });
  }
  async find(id: string) {
    return applicationSchema.parse(await this.rpc("application_find", { p_id: id }));
  }
  async resumeChoices(cursor?: string) {
    let before: string | null = null;
    if (cursor) {
      try {
        before = z.uuid().parse(JSON.parse(Buffer.from(cursor, "base64url").toString()));
      } catch {
        throw new ApplicationError("RF_INVALID_INPUT", 400, "The resume cursor is invalid.");
      }
    }
    const raw = await this.rpc("resume_tracking_choices", { p_before: before });
    return resumeChoicePageSchema.parse({ data: raw.data, nextCursor: encode(raw.lastId) });
  }
  async events(id: string, cursor?: string) {
    const raw = await this.rpc("application_events_list", { p_id: id, p_before: decode(cursor) });
    return eventPageSchema.parse({ data: raw.data, nextCursor: encode(raw.lastSequence) });
  }
  async track(input: Parameters<ApplicationRepository["track"]>[0], key: string) {
    return applicationSchema.parse(
      await this.rpc("application_track", { p_job: input.jobId, p_key: key }),
    );
  }
  async edit(id: string, input: Parameters<ApplicationRepository["edit"]>[1]) {
    return applicationSchema.parse(await this.rpc("application_edit", { p_id: id, p_data: input }));
  }
  async newCycle(id: string, expectedRevision: number, key: string) {
    return applicationSchema.parse(
      await this.rpc("application_new_cycle", {
        p_id: id,
        p_expected: expectedRevision,
        p_key: key,
      }),
    );
  }
  async addFollowUp(
    id: string,
    input: Parameters<ApplicationRepository["addFollowUp"]>[1],
    key: string,
  ) {
    return applicationSchema.parse(
      await this.rpc("application_follow_up_add", { p_id: id, p_data: input, p_key: key }),
    );
  }
  async editFollowUp(
    id: string,
    followUpId: string,
    input: Parameters<ApplicationRepository["editFollowUp"]>[2],
  ) {
    return applicationSchema.parse(
      await this.rpc("application_follow_up_edit", {
        p_id: id,
        p_follow_up: followUpId,
        p_data: input,
      }),
    );
  }
  async removeFollowUp(id: string, followUpId: string, expectedRevision: number) {
    return applicationSchema.parse(
      await this.rpc("application_follow_up_delete", {
        p_id: id,
        p_follow_up: followUpId,
        p_expected: expectedRevision,
      }),
    );
  }
  async remove(id: string, expectedRevision: number) {
    return z
      .object({ deleted: z.literal(true) })
      .parse(await this.rpc("application_delete", { p_id: id, p_expected: expectedRevision }));
  }
}
