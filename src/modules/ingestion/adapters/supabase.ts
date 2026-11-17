import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeDatabaseError } from "../../platform/database-errors";
import { ApplicationError } from "../../platform/errors";
import { TaskFailure } from "../../tasks/model";
import {
  importSourceSchema,
  importTaskReplySchema,
  importBatchSchema,
  importSettingSchema,
  importBatchSummarySchema,
  importContextSchema,
  importReviewSchema,
  importReviewPreparationSchema,
  importReceiptSchema,
  sanitizedImportSchema,
} from "../model";
import type {
  ImportSubmissionStore,
  ImportAdministrationStore,
  ImportExecutionStore,
  ImportReviewStore,
} from "../ports";
async function rpc(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown> = {},
  signal?: AbortSignal,
) {
  const { data, error } = await client
    .rpc(name, args)
    .abortSignal(AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(10000)]));
  if (error) throw safeDatabaseError(error);
  return data;
}
export class SupabaseImportRepository
  implements ImportSubmissionStore, ImportAdministrationStore, ImportReviewStore
{
  constructor(private readonly client: SupabaseClient) {}
  async source(id: string) {
    return importSourceSchema.parse(await rpc(this.client, "ingestion_source_find", { p_id: id }));
  }
  async submit(input: Parameters<ImportSubmissionStore["submit"]>[0], key: string) {
    const result = importTaskReplySchema.parse(
      await rpc(this.client, "ingestion_batch_submit", {
        p_source: input.sourceId,
        p_batch: input.batchId,
        p_fingerprint: input.sourceFingerprint,
        p_content: input.content,
        p_raw_hash: input.rawHash,
        p_key: key,
      }),
    );
    if (!result.taskId)
      throw new ApplicationError(
        "RF_CONFLICT",
        409,
        "The batch owner or task is no longer available.",
      );
    return { ...result, taskId: result.taskId };
  }
  async settings() {
    return z.array(importSettingSchema).parse(await rpc(this.client, "ingestion_settings_list"));
  }
  async configure(
    id: string,
    expectedRevision: number,
    uploadsEnabled: boolean,
    allowClosure: boolean,
  ) {
    return importSourceSchema.parse(
      await rpc(this.client, "ingestion_settings_update", {
        p_source: id,
        p_expected: expectedRevision,
        p_uploads: uploadsEnabled,
        p_closure: allowClosure,
      }),
    );
  }
  async find(id: string) {
    return importBatchSchema.parse(await rpc(this.client, "ingestion_batch_find", { p_id: id }));
  }
  async list(cursor?: string) {
    let before: string | null = null;
    if (cursor) {
      try {
        before = z
          .string()
          .regex(/^[1-9]\d{0,18}$/)
          .refine((value) => BigInt(value) <= 9223372036854775807n)
          .parse(JSON.parse(Buffer.from(cursor, "base64url").toString()));
      } catch {
        throw new ApplicationError("RF_INVALID_INPUT", 400, "The batch cursor is invalid.");
      }
    }
    const raw = await rpc(this.client, "ingestion_batches_list", { p_before: before });
    return {
      data: z.array(importBatchSummarySchema).parse(raw.data),
      nextCursor: raw.lastSequence
        ? Buffer.from(JSON.stringify(raw.lastSequence)).toString("base64url")
        : null,
    };
  }
  async review(id: string) {
    return importReviewSchema.parse(await rpc(this.client, "ingestion_review_find", { p_id: id }));
  }
  async prepareReview(id: string, expectedRevision: number, targetId: string | null) {
    return importReviewPreparationSchema.parse(
      await rpc(this.client, "ingestion_review_context", {
        p_id: id,
        p_expected: expectedRevision,
        p_target: targetId,
      }),
    );
  }
  async rebase(
    id: string,
    expectedRevision: number,
    targetId: string | null,
    sourceFingerprint: string,
    dictionaryVersion: number,
    normalized: Parameters<ImportReviewStore["rebase"]>[5],
  ) {
    return importReviewSchema.parse(
      await rpc(this.client, "ingestion_review_rebase", {
        p_id: id,
        p_expected: expectedRevision,
        p_target: targetId,
        p_fingerprint: sourceFingerprint,
        p_dictionary: dictionaryVersion,
        p_normalized: normalized,
      }),
    );
  }
  async decide(
    id: string,
    expectedRevision: number,
    decision: Parameters<ImportReviewStore["decide"]>[2],
    draft: Record<string, unknown> | null,
    reason: string,
    allowNewDuplicate: boolean,
    key: string,
  ) {
    return importReceiptSchema.parse(
      await rpc(this.client, "ingestion_review_decide", {
        p_id: id,
        p_expected: expectedRevision,
        p_decision: decision,
        p_draft: draft,
        p_reason: reason,
        p_duplicate: allowNewDuplicate,
        p_key: key,
      }),
    );
  }
}
export class SupabaseImportExecutionStore implements ImportExecutionStore {
  constructor(private readonly client: SupabaseClient) {}
  private async call(
    name: string,
    lease: Parameters<ImportExecutionStore["load"]>[0],
    signal: AbortSignal,
    extra: Record<string, unknown> = {},
  ) {
    try {
      return await rpc(
        this.client,
        name,
        { p_task: lease.taskId, p_token: lease.token, ...extra },
        signal,
      );
    } catch (error) {
      if (error instanceof ApplicationError)
        throw new TaskFailure(
          error.code === "RF_FORBIDDEN"
            ? "forbidden"
            : ["RF_STALE_INPUT", "RF_CONFLICT", "RF_NOT_FOUND"].includes(error.code)
              ? "stale"
              : error.code === "RF_INVALID_INPUT" ||
                  error.code === "RF_INGESTION_LIMIT" ||
                  error.code === "RF_IMMUTABLE"
                ? "validation"
                : "infrastructure",
        );
      throw error;
    }
  }
  async load(lease: Parameters<ImportExecutionStore["load"]>[0], signal: AbortSignal) {
    return z
      .object({ content: sanitizedImportSchema, context: importContextSchema })
      .parse(await this.call("ingestion_task_load", lease, signal));
  }
  async publish(
    lease: Parameters<ImportExecutionStore["publish"]>[0],
    output: Parameters<ImportExecutionStore["publish"]>[1],
    signal: AbortSignal,
  ) {
    await this.call("ingestion_task_publish", lease, signal, { p_output: output });
  }
}
