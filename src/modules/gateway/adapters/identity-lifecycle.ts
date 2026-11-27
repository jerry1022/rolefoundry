import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { IdentityWorkerGuard } from "../../identity/service";
import type { AnalysisLifecycle } from "../analysis";

/** Identity RPCs carry no abort signal; bound them so a hung connection cannot hang a task. */
function bounded<T>(work: Promise<T>, ms = 5000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Identity lifecycle call timed out.")), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Identity budget lifecycle through the existing trusted worker guard. */
export class IdentityAnalysisLifecycle implements AnalysisLifecycle {
  private readonly guard: IdentityWorkerGuard;
  constructor(client: SupabaseClient) {
    this.guard = new IdentityWorkerGuard(client);
  }
  async start(identityTaskId: string) {
    const result = z
      .object({ status: z.string() })
      .parse(await bounded(this.guard.start(identityTaskId)));
    return result.status === "running" ? ("running" as const) : ("failed" as const);
  }
  async finish(identityTaskId: string, resultRef: string) {
    await bounded(this.guard.finish(identityTaskId, resultRef));
  }
  async fail(identityTaskId: string, category: "infrastructure" | "validation") {
    await bounded(this.guard.fail(identityTaskId, category));
  }
  async release(identityTaskId: string) {
    await bounded(this.guard.release(identityTaskId));
  }
}

/** Runs the bounded reservation sweep; returns how many analyses were reclaimed. */
export async function sweepAnalyses(client: SupabaseClient, signal: AbortSignal) {
  const { data, error } = await client
    .rpc("identity_sweep_analyses", { p_limit: 50 })
    .abortSignal(AbortSignal.any([signal, AbortSignal.timeout(5000)]));
  if (error) throw new Error("Analysis sweep is unavailable.");
  return typeof data === "number" ? data : 0;
}
