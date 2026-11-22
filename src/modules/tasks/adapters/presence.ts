import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeDatabaseError } from "../../platform/database-errors";
import type { WorkerPresenceStore, WorkerDescriptor, WorkerState } from "../ports";
export class SupabaseWorkerPresenceStore implements WorkerPresenceStore {
  constructor(private readonly client: SupabaseClient) {}
  async report(worker: WorkerDescriptor, state: WorkerState) {
    const { error } = await this.client
      .rpc("worker_report", {
        p_worker: worker.id,
        p_kinds: worker.kinds,
        p_seconds: worker.leaseSeconds,
        p_concurrency: worker.concurrency,
        p_state: state,
      })
      .abortSignal(AbortSignal.timeout(10000));
    if (error) throw safeDatabaseError(error);
  }
}
