import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeDatabaseError } from "../../platform/database-errors";
import { TaskFailure } from "../../tasks/model";
export async function resumeRpc(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown> = {},
  signal?: AbortSignal,
) {
  const query = client.rpc(name, args),
    { data, error } = await (signal ? query.abortSignal(signal) : query);
  if (error) throw safeDatabaseError(error);
  return data;
}
export async function resumeWorkerRpc(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
) {
  const { data, error } = await client.rpc(name, args).abortSignal(signal);
  if (error)
    throw new TaskFailure(
      error.message === "RF_FORBIDDEN"
        ? "forbidden"
        : ["RF_CONFLICT", "RF_STALE_INPUT", "RF_NOT_FOUND"].includes(error.message)
          ? "stale"
          : ["RF_INVALID_INPUT", "RF_RESUME_LIMIT"].includes(error.message)
            ? "validation"
            : "infrastructure",
    );
  return data;
}
