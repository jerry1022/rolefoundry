import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeDatabaseError } from "../../platform/database-errors";
import { ApplicationError } from "../../platform/errors";
import { TaskFailure } from "../../tasks/model";
import { feedRunSchema, feedSettingSchema, importSourceSchema } from "../model";
import type { FeedAdministrationStore, FeedExecutionStore, FeedScheduleStore } from "../ports";
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
export class SupabaseFeedAdministrationStore implements FeedAdministrationStore {
  constructor(private readonly client: SupabaseClient) {}
  async source(id: string) {
    return importSourceSchema.parse(await rpc(this.client, "ingestion_source_find", { p_id: id }));
  }
  async feedSettings() {
    return z.array(feedSettingSchema).parse(await rpc(this.client, "ingestion_feed_settings_list"));
  }
  async configureFeed(
    id: string,
    input: Parameters<FeedAdministrationStore["configureFeed"]>[1],
    revision: string,
  ) {
    return feedSettingSchema.parse(
      await rpc(this.client, "ingestion_feed_configure", {
        p_source: id,
        p_expected: input.expectedRevision,
        p_feed: input.feedId,
        p_revision: revision,
        p_enabled: input.enabled,
        p_minutes: input.intervalMinutes,
        p_resume: input.resume,
      }),
    );
  }
  async requestFeed(id: string, key: string) {
    return feedRunSchema.parse(
      await rpc(this.client, "ingestion_feed_request", { p_source: id, p_key: key }),
    );
  }
  async feedRun(id: string) {
    return feedRunSchema.parse(await rpc(this.client, "ingestion_feed_find", { p_id: id }));
  }
  async feedRuns() {
    return z.array(feedRunSchema).parse(await rpc(this.client, "ingestion_feed_runs_list"));
  }
}
export class SupabaseFeedExecutionStore implements FeedExecutionStore, FeedScheduleStore {
  constructor(private readonly client: SupabaseClient) {}
  private async call(
    name: string,
    lease: Parameters<FeedExecutionStore["load"]>[0],
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
              : ["RF_INVALID_INPUT", "RF_INGESTION_LIMIT"].includes(error.code)
                ? "validation"
                : "infrastructure",
        );
      throw error;
    }
  }
  async load(lease: Parameters<FeedExecutionStore["load"]>[0], signal: AbortSignal) {
    return z
      .object({
        source: importSourceSchema,
        feedId: z.string(),
        feedRevision: z.string(),
        waitSeconds: z.number().int().min(0).max(86400),
      })
      .parse(await this.call("ingestion_feed_load", lease, signal));
  }
  async prepare(
    lease: Parameters<FeedExecutionStore["prepare"]>[0],
    content: Parameters<FeedExecutionStore["prepare"]>[1],
    rawHash: string,
    signal: AbortSignal,
  ) {
    return z.uuid().parse(
      await this.call("ingestion_feed_prepare", lease, signal, {
        p_content: content,
        p_raw_hash: rawHash,
      }),
    );
  }
  async failure(
    lease: Parameters<FeedExecutionStore["failure"]>[0],
    code: string,
    providerWait: string | null,
    manual: boolean,
    signal: AbortSignal,
  ) {
    await this.call("ingestion_feed_failure", lease, signal, {
      p_code: code,
      p_wait: providerWait,
      p_manual: manual,
    });
  }
  async due(definitions: Parameters<FeedScheduleStore["due"]>[0], signal: AbortSignal) {
    return z
      .number()
      .int()
      .nonnegative()
      .parse(
        await rpc(
          this.client,
          "ingestion_schedule_due",
          { p_definitions: definitions, p_limit: 10 },
          signal,
        ),
      );
  }
}
