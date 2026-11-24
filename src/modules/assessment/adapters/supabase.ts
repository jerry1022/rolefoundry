import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeDatabaseError } from "../../platform/database-errors";
import {
  attemptSchema,
  attemptPageSchema,
  attemptSummarySchema,
  questionBankSchema,
  type QuestionTranslationInput,
  type QuestionTranslationRemoval,
} from "../model";
import type { AssessmentRepository, AssessmentAdministrationRepository } from "../ports";
import type { TaskHandler } from "../../tasks/ports";
import { TaskFailure } from "../../tasks/model";
async function rpc(client: SupabaseClient, name: string, input?: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, input);
  if (error) throw safeDatabaseError(error);
  return data;
}
export class SupabaseAssessmentRepository implements AssessmentRepository {
  constructor(private readonly client: SupabaseClient) {}
  async retry(id: string, previousTaskId: string, idempotencyKey: string) {
    return z.object({ taskId: z.uuid(), status: z.string() }).parse(
      await rpc(this.client, "assessment_retry", {
        p_id: id,
        p_previous: previousTaskId,
        p_key: idempotencyKey,
      }),
    );
  }
  async start(track: Parameters<AssessmentRepository["start"]>[0]) {
    return attemptSchema.parse(await rpc(this.client, "assessment_start", { p_track: track }));
  }
  async find(id: string) {
    return attemptSchema.parse(await rpc(this.client, "assessment_find", { p_id: id }));
  }
  async list(cursor?: string) {
    let after: string | null = null;
    if (cursor) {
      try {
        after = z.uuid().parse(Buffer.from(cursor, "base64url").toString("utf8"));
      } catch {
        throw safeDatabaseError({ message: "RF_INVALID_INPUT" });
      }
    }
    const result = z
      .object({ data: z.array(attemptSummarySchema), lastId: z.uuid().nullable() })
      .parse(await rpc(this.client, "assessment_list", { p_after: after }));
    return attemptPageSchema.parse({
      data: result.data,
      nextCursor: result.lastId ? Buffer.from(result.lastId).toString("base64url") : null,
    });
  }
  async save(id: string, input: Parameters<AssessmentRepository["save"]>[1]) {
    return attemptSchema.parse(
      await rpc(this.client, "assessment_save", {
        p_id: id,
        p_expected: input.expectedRevision,
        p_answers: input.answers,
      }),
    );
  }
  async submit(id: string, input: Parameters<AssessmentRepository["submit"]>[1]) {
    return z.object({ taskId: z.uuid(), status: z.string() }).parse(
      await rpc(this.client, "assessment_submit", {
        p_id: id,
        p_expected: input.expectedRevision,
        p_answers: input.answers,
        p_key: input.idempotencyKey,
      }),
    );
  }
}
export class SupabaseAssessmentAdministrationRepository implements AssessmentAdministrationRepository {
  constructor(private readonly client: SupabaseClient) {}
  async bank() {
    return questionBankSchema.parse(await rpc(this.client, "assessment_bank_admin"));
  }
  async rubric(input: Parameters<AssessmentAdministrationRepository["rubric"]>[0]) {
    return z
      .object({ id: z.uuid() })
      .parse(await rpc(this.client, "assessment_rubric_create", { p_data: input }));
  }
  async question(input: Parameters<AssessmentAdministrationRepository["question"]>[0]) {
    return z
      .object({ id: z.uuid() })
      .parse(await rpc(this.client, "assessment_question_create", { p_data: input }));
  }
  async review(id: string, reason: string) {
    await rpc(this.client, "assessment_question_review", {
      p_id: id,
      p_reason: reason,
      p_reviewed: true,
    });
  }
  async retire(id: string, reason: string) {
    await rpc(this.client, "assessment_question_review", {
      p_id: id,
      p_reason: reason,
      p_reviewed: false,
    });
  }
  async translate(id: string, input: QuestionTranslationInput) {
    const { locale, ...text } = input;
    await rpc(this.client, "assessment_question_translate", {
      p_id: id,
      p_locale: locale,
      p_data: text,
    });
  }
  async removeTranslation(id: string, input: QuestionTranslationRemoval) {
    await rpc(this.client, "assessment_question_untranslate", {
      p_id: id,
      p_locale: input.locale,
      p_reason: input.reason,
    });
  }
}
/** Trusted worker adapter: the database publishes result/evidence/terminal state atomically. */
export class SupabaseAssessmentGrader implements TaskHandler {
  constructor(private readonly client: SupabaseClient) {}
  async execute(lease: Parameters<TaskHandler["execute"]>[0], signal: AbortSignal) {
    if (signal.aborted) throw new TaskFailure("canceled");
    const { error } = await this.client
      .rpc("assessment_grade_task", { p_task: lease.taskId, p_token: lease.token })
      .abortSignal(signal);
    if (error) {
      const category =
        error.message === "RF_FORBIDDEN"
          ? "forbidden"
          : error.message === "RF_STALE_INPUT" ||
              error.message === "RF_NOT_FOUND" ||
              error.message === "RF_CONFLICT"
            ? "stale"
            : error.message === "RF_INVALID_INPUT"
              ? "validation"
              : "infrastructure";
      throw new TaskFailure(category);
    }
  }
}
