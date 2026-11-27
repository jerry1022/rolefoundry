import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeDatabaseError } from "../../platform/database-errors";
import { replayContextSchema, replayResultSchema, type TaskReplayStore } from "../replay";
export class SupabaseTaskReplayStore implements TaskReplayStore {
  constructor(private readonly client: SupabaseClient) {}
  private async rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await this.client
      .rpc(name, args)
      .abortSignal(AbortSignal.timeout(10000));
    if (error) throw safeDatabaseError(error);
    return data;
  }
  async context(taskId: string) {
    return replayContextSchema.parse(
      await this.rpc("operations_replay_context", { p_task: taskId }),
    );
  }
  async request(taskId: string, input: Parameters<TaskReplayStore["request"]>[1]) {
    return replayResultSchema.parse(
      await this.rpc("operations_task_replay", {
        p_task: taskId,
        p_request: input.requestId,
        p_reason: input.reason,
      }),
    );
  }
}
