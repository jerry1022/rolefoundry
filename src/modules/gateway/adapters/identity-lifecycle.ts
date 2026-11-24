import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { IdentityWorkerGuard } from "../../identity/service";
import type { AnalysisLifecycle } from "../analysis";

/** Identity budget lifecycle through the existing trusted worker guard. */
export class IdentityAnalysisLifecycle implements AnalysisLifecycle {
  private readonly guard: IdentityWorkerGuard;
  constructor(client: SupabaseClient) {
    this.guard = new IdentityWorkerGuard(client);
  }
  async start(identityTaskId: string) {
    const result = z.object({ status: z.string() }).parse(await this.guard.start(identityTaskId));
    return result.status === "running" ? ("running" as const) : ("failed" as const);
  }
  async finish(identityTaskId: string, resultRef: string) {
    await this.guard.finish(identityTaskId, resultRef);
  }
  async fail(identityTaskId: string, category: "infrastructure" | "validation") {
    await this.guard.fail(identityTaskId, category);
  }
  async release(identityTaskId: string) {
    await this.guard.release(identityTaskId);
  }
}
