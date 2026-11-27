import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeDatabaseError } from "../../platform/database-errors";
import { TaskFailure } from "../../tasks/model";
import { matchTaskSchema, matchRunSchema, matchHistorySchema, matchSnapshotSchema } from "../model";
import type { MatchingRepository, MatchingExecutionStore } from "../ports";
async function rpc(client: SupabaseClient, name: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw safeDatabaseError(error);
  return data;
}
function decode(cursor: string | undefined, rank = false) {
  if (!cursor) return null;
  try {
    const value = Buffer.from(cursor, "base64url").toString("utf8");
    if (!/^[1-9][0-9]{0,17}$/.test(value) || (rank && Number(value) > 200)) throw Error();
    return value;
  } catch {
    throw safeDatabaseError({ message: "RF_INVALID_INPUT" });
  }
}
const encode = (value: string | number | null) =>
  value === null ? null : Buffer.from(String(value)).toString("base64url");
export class SupabaseMatchingRepository implements MatchingRepository {
  constructor(private readonly client: SupabaseClient) {}
  async refresh(input: Parameters<MatchingRepository["refresh"]>[0], key: string) {
    return matchTaskSchema.parse(
      await rpc(this.client, "matching_refresh", {
        p_job: input.jobId,
        p_constraints: input.constraints,
        p_key: key,
      }),
    );
  }
  async find(id: string, cursor?: string) {
    const raw = z
      .object({ lastRank: z.number().int().nullable() })
      .passthrough()
      .parse(
        await rpc(this.client, "matching_find", {
          p_run: id,
          p_after: Number(decode(cursor, true) || 0),
        }),
      );
    return matchRunSchema.parse({ ...raw, nextCursor: encode(raw.lastRank) });
  }
  async list(cursor?: string) {
    const raw = z
      .object({ data: matchHistorySchema.shape.data, lastSequence: z.string().nullable() })
      .parse(await rpc(this.client, "matching_list", { p_before: decode(cursor) }));
    return matchHistorySchema.parse({ data: raw.data, nextCursor: encode(raw.lastSequence) });
  }
}
export class SupabaseMatchingExecutionStore implements MatchingExecutionStore {
  constructor(private readonly client: SupabaseClient) {}
  private async execute(name: string, args: Record<string, unknown>, signal: AbortSignal) {
    const { data, error } = await this.client.rpc(name, args).abortSignal(signal);
    if (error)
      throw new TaskFailure(
        error.message === "RF_FORBIDDEN"
          ? "forbidden"
          : ["RF_STALE_INPUT", "RF_NOT_FOUND", "RF_CONFLICT"].includes(error.message)
            ? "stale"
            : error.message === "RF_INVALID_INPUT"
              ? "validation"
              : "infrastructure",
      );
    return data;
  }
  async load(lease: Parameters<MatchingExecutionStore["load"]>[0], signal: AbortSignal) {
    const parsed = matchSnapshotSchema.safeParse(
      await this.execute(
        "matching_load_task",
        { p_task: lease.taskId, p_token: lease.token },
        signal,
      ),
    );
    if (!parsed.success) throw new TaskFailure("validation");
    return parsed.data;
  }
  async publish(
    lease: Parameters<MatchingExecutionStore["publish"]>[0],
    results: Parameters<MatchingExecutionStore["publish"]>[1],
    signal: AbortSignal,
  ) {
    await this.execute(
      "matching_publish_task",
      { p_task: lease.taskId, p_token: lease.token, p_results: results },
      signal,
    );
  }
}
