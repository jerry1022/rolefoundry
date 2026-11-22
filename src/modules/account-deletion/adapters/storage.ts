import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApplicationError } from "../../platform/errors";
import type { DeletionFiles } from "../ports";
import type { DeletionFile } from "../model";
export class SupabaseDeletionFiles implements DeletionFiles {
  constructor(private readonly client: SupabaseClient) {}
  async remove(subjectId: string, files: DeletionFile[], signal: AbortSignal) {
    signal.throwIfAborted();
    if (
      files.some(
        (file) =>
          !file.key.startsWith(subjectId + "/") ||
          file.key.split("/").some((part) => part === ".." || part === "."),
      )
    )
      throw new ApplicationError(
        "RF_INVALID_INPUT",
        400,
        "The cleanup reference is outside the accepted account.",
      );
    for (const bucket of ["rolefoundry-resumes", "rolefoundry-account-exports"] as const) {
      const keys = files.filter((file) => file.bucket === bucket).map((file) => file.key);
      if (!keys.length) continue;
      signal.throwIfAborted();
      const { error } = await this.client.storage.from(bucket).remove(keys);
      if (error)
        throw new ApplicationError("RF_UNAVAILABLE", 503, "Account file cleanup will retry.");
    }
    signal.throwIfAborted();
  }
}
