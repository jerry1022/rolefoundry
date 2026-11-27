import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaskLease } from "../../tasks/model";
import { safeDatabaseError } from "../../platform/database-errors";
import {
  deletionStatusSchema,
  deletionSubjectSchema,
  deletionFileSchema,
  type DeletionReceipt,
  type ResumeReason,
} from "../model";
import type { DeletionRepository, DeletionExecutionStore, LateDeletionStore } from "../ports";
async function rpc(client: SupabaseClient, name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await client.rpc(name, args).abortSignal(AbortSignal.timeout(10000));
  if (error) throw safeDatabaseError(error);
  return data;
}
export class SupabaseDeletionRepository implements DeletionRepository {
  constructor(private readonly client: SupabaseClient) {}
  async request(input: DeletionReceipt & { confirmation: "DELETE" }) {
    return deletionStatusSchema.parse(
      await rpc(this.client, "account_deletion_request", {
        p_id: input.id,
        p_secret: input.secret,
        p_confirmation: input.confirmation,
      }),
    );
  }
  async status(receipt: DeletionReceipt) {
    return deletionStatusSchema.parse(
      await rpc(this.client, "account_deletion_status", {
        p_id: receipt.id,
        p_secret: receipt.secret,
      }),
    );
  }
  async resume(id: string, reason: ResumeReason) {
    return deletionStatusSchema.parse(
      await rpc(this.client, "account_deletion_resume", { p_id: id, p_reason: reason }),
    );
  }
  async find(taskId: string) {
    return deletionStatusSchema.parse(
      await rpc(this.client, "account_deletion_admin_find", { p_task: taskId }),
    );
  }
}
const args = (lease: TaskLease) => ({ p_task: lease.taskId, p_token: lease.token });
export class SupabaseDeletionExecution implements DeletionExecutionStore {
  constructor(private readonly client: SupabaseClient) {}
  async load(lease: TaskLease) {
    return deletionSubjectSchema.parse(
      await rpc(this.client, "account_deletion_load", args(lease)),
    );
  }
  async files(lease: TaskLease) {
    return z
      .array(deletionFileSchema)
      .max(50)
      .parse(await rpc(this.client, "account_deletion_files", args(lease)));
  }
  async beginAuth(lease: TaskLease) {
    return z.boolean().parse(await rpc(this.client, "account_deletion_begin_auth", args(lease)));
  }
  async defer(lease: TaskLease, seconds: number) {
    await rpc(this.client, "account_deletion_defer", { ...args(lease), p_seconds: seconds });
  }
  async finish(lease: TaskLease) {
    await rpc(this.client, "account_deletion_finish", args(lease));
  }
}

export class SupabaseLateDeletionStore implements LateDeletionStore {
  constructor(private readonly client: SupabaseClient) {}
  async pending() {
    return z
      .array(z.object({ subjectId: z.uuid(), files: z.array(deletionFileSchema).max(50) }))
      .max(1)
      .parse(await rpc(this.client, "account_deletion_late_files"));
  }
}
