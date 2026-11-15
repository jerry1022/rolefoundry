import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeDatabaseError } from "../../platform/database-errors";
import { taskLeaseSchema, taskSchema } from "../model";
import type { TaskQueue, TaskRepository } from "../ports";
async function rpc(client: SupabaseClient, name: string, input: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, input);
  if (error) throw safeDatabaseError(error);
  return data;
}
export class SupabaseTaskRepository implements TaskRepository {
  constructor(private readonly client: SupabaseClient) {}
  async find(id: string) {
    return taskSchema.parse(await rpc(this.client, "task_find", { p_id: id }));
  }
}
export class SupabaseTaskQueue implements TaskQueue {
  constructor(private readonly client: SupabaseClient) {}
  async read(
    workerId: Parameters<TaskQueue["read"]>[0],
    kinds: Parameters<TaskQueue["read"]>[1],
    seconds: number,
    quantity: number,
  ) {
    return z.array(taskLeaseSchema).parse(
      await rpc(this.client, "task_read", {
        p_worker: workerId,
        p_kinds: kinds,
        p_seconds: seconds,
        p_quantity: quantity,
      }),
    );
  }
  async heartbeat(lease: Parameters<TaskQueue["heartbeat"]>[0]) {
    return z.boolean().parse(
      await rpc(this.client, "task_heartbeat", {
        p_task: lease.taskId,
        p_token: lease.token,
        p_seconds: lease.leaseSeconds,
      }),
    );
  }
  async acknowledge(lease: Parameters<TaskQueue["acknowledge"]>[0]) {
    await rpc(this.client, "task_ack", { p_task: lease.taskId, p_message: lease.messageId });
  }
  async fail(lease: Parameters<TaskQueue["fail"]>[0], category: Parameters<TaskQueue["fail"]>[1]) {
    return z.object({ status: z.string() }).parse(
      await rpc(this.client, "task_fail", {
        p_task: lease.taskId,
        p_token: lease.token,
        p_category: category,
      }),
    );
  }
  async release(lease: Parameters<TaskQueue["release"]>[0]) {
    return z
      .boolean()
      .parse(
        await rpc(this.client, "task_release", { p_task: lease.taskId, p_token: lease.token }),
      );
  }
}
