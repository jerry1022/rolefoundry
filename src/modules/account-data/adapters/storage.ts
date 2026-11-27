import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountArchiveStorage } from "../ports";
import { accountExportLimits } from "../model";
import { ApplicationError } from "../../platform/errors";
const bucket = "rolefoundry-account-exports";
function archiveKey(key: string) {
  if (!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.zip$/.test(key))
    throw new ApplicationError("RF_INVALID_INPUT", 400, "Invalid archive reference.");
}
export class SupabaseAccountArchiveStorage implements AccountArchiveStorage {
  constructor(private readonly client: SupabaseClient) {}
  private async read(bucket: string, key: string, limit: number, signal: AbortSignal) {
    signal.throwIfAborted();
    const { data, error } = await this.client.storage.from(bucket).download(key);
    signal.throwIfAborted();
    if (error || !data)
      throw new ApplicationError(
        "RF_UNAVAILABLE",
        503,
        "Private export storage is temporarily unavailable.",
      );
    if (data.size > limit)
      throw new ApplicationError("RF_TOO_LARGE", 413, "The private object exceeds its limit.");
    return new Uint8Array(await data.arrayBuffer());
  }
  source(key: string, signal: AbortSignal) {
    if (
      !/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/(?:source\/[a-f0-9-]{36}|exports\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.pdf)$/.test(
        key,
      )
    )
      throw new ApplicationError("RF_INVALID_INPUT", 400, "Invalid source reference.");
    return this.read("rolefoundry-resumes", key, 8 * 1024 * 1024, signal);
  }
  get(key: string, signal: AbortSignal) {
    archiveKey(key);
    return this.read(bucket, key, accountExportLimits.archiveBytes, signal);
  }
  async put(key: string, bytes: Uint8Array, signal: AbortSignal) {
    archiveKey(key);
    signal.throwIfAborted();
    if (bytes.length > accountExportLimits.archiveBytes)
      throw new ApplicationError("RF_TOO_LARGE", 413, "The archive exceeds its limit.");
    const { error } = await this.client.storage
      .from(bucket)
      .upload(key, bytes, { contentType: "application/zip", upsert: false, cacheControl: "0" });
    signal.throwIfAborted();
    if (error)
      throw new ApplicationError(
        "RF_UNAVAILABLE",
        503,
        "Private archive storage is temporarily unavailable.",
      );
  }
  async remove(keys: string[], signal: AbortSignal) {
    signal.throwIfAborted();
    for (const key of keys) archiveKey(key);
    if (!keys.length) return;
    const { error } = await this.client.storage.from(bucket).remove(keys);
    signal.throwIfAborted();
    if (error)
      throw new ApplicationError("RF_UNAVAILABLE", 503, "Private export cleanup will be retried.");
  }
}
