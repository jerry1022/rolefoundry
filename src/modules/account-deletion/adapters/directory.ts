import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApplicationError } from "../../platform/errors";
import type { DeletionDirectory } from "../ports";
export class SupabaseDeletionDirectory implements DeletionDirectory {
  constructor(private readonly client: SupabaseClient) {}
  private checked(error: { status?: number; code?: string } | null) {
    if (error && error.code !== "user_not_found" && error.status !== 404)
      throw new ApplicationError(
        "RF_UNAVAILABLE",
        503,
        "Account removal will retry when the identity service is available.",
      );
  }
  async block(id: string, signal: AbortSignal) {
    signal.throwIfAborted();
    const { error } = await this.client.auth.admin.updateUserById(id, { ban_duration: "876000h" });
    this.checked(error);
    signal.throwIfAborted();
  }
  async remove(id: string, signal: AbortSignal) {
    signal.throwIfAborted();
    const { error } = await this.client.auth.admin.deleteUser(id);
    this.checked(error);
    signal.throwIfAborted();
  }
}
