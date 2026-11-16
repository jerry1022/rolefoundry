import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeDatabaseError } from "../../platform/database-errors";
import { TaskFailure } from "../../tasks/model";
import {
  courseSchema,
  coursePageSchema,
  courseBankSchema,
  planSchema,
  planHistorySchema,
  courseProgressSchema,
  learningTaskSchema,
  learningSnapshotSchema,
} from "../model";
import type {
  CourseCatalog,
  LearningRepository,
  LearningAdministration,
  LearningExecutionStore,
} from "../ports";
async function rpc(client: SupabaseClient, name: string, input: Record<string, unknown> = {}) {
  const { data, error } = await client.rpc(name, input);
  if (error) throw safeDatabaseError(error);
  return data;
}
const encode = (value: unknown) =>
  value === null ? null : Buffer.from(JSON.stringify(value)).toString("base64url");
function decode(cursor: string) {
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw safeDatabaseError({ message: "RF_INVALID_INPUT" });
  }
}
export class SupabaseCourseCatalog implements CourseCatalog {
  constructor(private readonly client: SupabaseClient) {}
  async find(id: string) {
    return courseSchema.parse(await rpc(this.client, "learning_course_find", { p_id: id }));
  }
  async list(query: Parameters<CourseCatalog["list"]>[0]) {
    const filter = JSON.stringify({
      skill: query.skill || null,
      difficulty: query.difficulty || null,
    });
    let after: string | null = null,
      revision: number | null = null,
      dictionary: number | null = null;
    if (query.cursor) {
      const cursor = z
        .object({
          id: z.uuid(),
          revision: z.number().int().nonnegative(),
          dictionary: z.number().int().positive(),
          filter: z.string(),
        })
        .safeParse(decode(query.cursor));
      if (!cursor.success || cursor.data.filter !== filter)
        throw safeDatabaseError({ message: "RF_INVALID_INPUT" });
      after = cursor.data.id;
      revision = cursor.data.revision;
      dictionary = cursor.data.dictionary;
    }
    const result = z
      .object({
        data: z.array(courseSchema),
        lastId: z.uuid().nullable(),
        revision: z.number().int().nonnegative(),
        dictionaryVersion: z.number().int().positive(),
      })
      .parse(
        await rpc(this.client, "learning_courses_list", {
          p_skill: query.skill || null,
          p_difficulty: query.difficulty || null,
          p_after: after,
          p_revision: revision,
          p_dictionary: dictionary,
        }),
      );
    return coursePageSchema.parse({
      ...result,
      nextCursor: result.lastId
        ? encode({
            id: result.lastId,
            revision: result.revision,
            dictionary: result.dictionaryVersion,
            filter,
          })
        : null,
    });
  }
}
export class SupabaseLearningRepository implements LearningRepository {
  constructor(private readonly client: SupabaseClient) {}
  async start(input: Parameters<LearningRepository["start"]>[0], key: string) {
    return learningTaskSchema.parse(
      await rpc(this.client, "learning_plan_start", {
        p_job: input.jobId,
        p_hours: input.weeklyHours,
        p_overrides: input.durationOverrides,
        p_key: key,
      }),
    );
  }
  async find(id: string) {
    return planSchema.parse(await rpc(this.client, "learning_plan_find", { p_id: id }));
  }
  async list(cursor?: string) {
    const before = cursor
      ? z
          .string()
          .regex(/^[1-9][0-9]{0,17}$/)
          .safeParse(decode(cursor))
      : null;
    if (before && !before.success) throw safeDatabaseError({ message: "RF_INVALID_INPUT" });
    const raw = z
      .object({ data: planHistorySchema.shape.data, lastSequence: z.string().nullable() })
      .parse(
        await rpc(this.client, "learning_plans_list", {
          p_before: before?.success ? before.data : null,
        }),
      );
    return planHistorySchema.parse({ data: raw.data, nextCursor: encode(raw.lastSequence) });
  }
  async progress() {
    return courseProgressSchema.parse(await rpc(this.client, "learning_progress_read"));
  }
  async courseProgress(id: string, revision: number, completed: boolean) {
    return courseProgressSchema.parse(
      await rpc(this.client, "learning_course_progress", {
        p_course: id,
        p_expected: revision,
        p_completed: completed,
      }),
    );
  }
  async stepProgress(planId: string, stepId: string, revision: number, completed: boolean) {
    return planSchema.parse(
      await rpc(this.client, "learning_step_progress", {
        p_plan: planId,
        p_step: stepId,
        p_expected: revision,
        p_completed: completed,
      }),
    );
  }
  async practice(
    planId: string,
    stepId: string,
    input: Parameters<LearningRepository["practice"]>[2],
  ) {
    return planSchema.parse(
      await rpc(this.client, "learning_practice", {
        p_plan: planId,
        p_step: stepId,
        p_expected: input.expectedRevision,
        p_url: input.url,
        p_summary: input.summary,
      }),
    );
  }
  async removePractice(planId: string, submissionId: string, revision: number) {
    return planSchema.parse(
      await rpc(this.client, "learning_practice_delete", {
        p_plan: planId,
        p_submission: submissionId,
        p_expected: revision,
      }),
    );
  }
}
export class SupabaseLearningAdministration implements LearningAdministration {
  constructor(private readonly client: SupabaseClient) {}
  async bank() {
    return courseBankSchema.parse(await rpc(this.client, "learning_bank"));
  }
  async source(input: Parameters<LearningAdministration["source"]>[0]) {
    return z
      .object({ id: z.uuid() })
      .parse(await rpc(this.client, "learning_source_create", { p_data: input }));
  }
  async sourceStatus(id: string, status: "active" | "revoked", reason: string) {
    await rpc(this.client, "learning_source_status", {
      p_id: id,
      p_status: status,
      p_reason: reason,
    });
  }
  async create(input: Parameters<LearningAdministration["create"]>[0]) {
    return z
      .object({ id: z.uuid(), revision: z.number() })
      .parse(await rpc(this.client, "learning_course_create", { p_data: input }));
  }
  async revise(
    id: string,
    input: Parameters<LearningAdministration["revise"]>[1],
    revision: number,
  ) {
    return z.object({ id: z.uuid(), revision: z.number() }).parse(
      await rpc(this.client, "learning_course_revise", {
        p_id: id,
        p_expected: revision,
        p_data: input,
      }),
    );
  }
  async transition(id: string, input: Parameters<LearningAdministration["transition"]>[1]) {
    await rpc(this.client, "learning_course_transition", {
      p_id: id,
      p_expected: input.expectedRevision,
      p_action: input.action,
      p_reason: input.reason,
    });
  }
}
export class SupabaseLearningExecutionStore implements LearningExecutionStore {
  constructor(private readonly client: SupabaseClient) {}
  private async execute(name: string, args: Record<string, unknown>, signal: AbortSignal) {
    const { data, error } = await this.client.rpc(name, args).abortSignal(signal);
    if (error)
      throw new TaskFailure(
        error.message === "RF_FORBIDDEN"
          ? "forbidden"
          : ["RF_CONFLICT", "RF_STALE_INPUT", "RF_NOT_FOUND"].includes(error.message)
            ? "stale"
            : error.message === "RF_INVALID_INPUT"
              ? "validation"
              : "infrastructure",
      );
    return data;
  }
  async load(lease: Parameters<LearningExecutionStore["load"]>[0], signal: AbortSignal) {
    const result = learningSnapshotSchema.safeParse(
      await this.execute(
        "learning_load_task",
        { p_task: lease.taskId, p_token: lease.token },
        signal,
      ),
    );
    if (!result.success) throw new TaskFailure("validation");
    return result.data;
  }
  async publish(
    lease: Parameters<LearningExecutionStore["publish"]>[0],
    output: Parameters<LearningExecutionStore["publish"]>[1],
    signal: AbortSignal,
  ) {
    await this.execute(
      "learning_publish_task",
      { p_task: lease.taskId, p_token: lease.token, p_output: output },
      signal,
    );
  }
}
