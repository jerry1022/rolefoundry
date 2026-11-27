import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvalidationStore } from "../ports";
import {
  invalidationLeaseSchema,
  invalidationResultSchema,
  type InvalidationLease,
} from "../model";
/** Only opaque delivery leases cross this boundary; owner IDs and evidence references stay in SQL. */
export class SupabaseInvalidationStore implements InvalidationStore {
  constructor(private readonly client: SupabaseClient) {}
  private async rpc(name: string, args: Record<string, unknown>, signal: AbortSignal) {
    const result = await this.client
      .rpc(name, args)
      .abortSignal(AbortSignal.any([signal, AbortSignal.timeout(5000)]));
    if (result.error) throw new Error("Invalidation store is unavailable.");
    return result.data;
  }
  async claim(signal: AbortSignal) {
    return z
      .array(invalidationLeaseSchema)
      .max(4)
      .parse(await this.rpc("invalidation_claim", {}, signal));
  }
  async apply(lease: InvalidationLease, signal: AbortSignal) {
    return invalidationResultSchema.parse(
      await this.rpc(
        "invalidation_apply",
        {
          p_id: lease.id,
          p_token: lease.token,
        },
        signal,
      ),
    );
  }
  async retry(lease: InvalidationLease, signal: AbortSignal) {
    await this.rpc("invalidation_retry", { p_id: lease.id, p_token: lease.token }, signal);
  }
}
