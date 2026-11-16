import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PrivateResumeStorage, ResumeDigest } from "../ports";
import type { ResumeMedia } from "../model";
import { resumeLimits } from "../model";
import { ApplicationError } from "../../platform/errors";
const bucket = "rolefoundry-resumes";
function checkKey(key: string) {
  if (
    !/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/(?:source\/[a-f0-9-]{36}|exports\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.pdf)$/.test(
      key,
    )
  )
    throw new ApplicationError("RF_INVALID_INPUT", 400, "The private object reference is invalid.");
}
export class Sha256ResumeDigest implements ResumeDigest {
  sha256(bytes: Uint8Array) {
    return createHash("sha256").update(bytes).digest("hex");
  }
}
export class SupabaseResumeStorage implements PrivateResumeStorage {
  constructor(private readonly client: SupabaseClient) {}
  async put(key: string, bytes: Uint8Array, mediaType: ResumeMedia, signal: AbortSignal) {
    signal.throwIfAborted();
    checkKey(key);
    if (bytes.length > resumeLimits.sourceBytes)
      throw new ApplicationError(
        "RF_INVALID_INPUT",
        400,
        "The file exceeds the private storage limit.",
      );
    const { error } = await this.client.storage
      .from(bucket)
      .upload(key, bytes, { contentType: mediaType, upsert: false, cacheControl: "0" });
    signal.throwIfAborted();
    if (error)
      throw new ApplicationError(
        "RF_UNAVAILABLE",
        503,
        "Private file storage is temporarily unavailable.",
      );
  }
  async get(key: string, signal: AbortSignal) {
    signal.throwIfAborted();
    checkKey(key);
    const { data, error } = await this.client.storage.from(bucket).download(key);
    signal.throwIfAborted();
    if (error || !data)
      throw new ApplicationError("RF_UNAVAILABLE", 503, "The private file is unavailable.");
    if (data.size > resumeLimits.sourceBytes)
      throw new ApplicationError(
        "RF_INVALID_INPUT",
        400,
        "The private file exceeds its size limit.",
      );
    const bytes = new Uint8Array(await data.arrayBuffer());
    signal.throwIfAborted();
    return bytes;
  }
  async remove(keys: string[], signal: AbortSignal) {
    signal.throwIfAborted();
    for (const key of keys) checkKey(key);
    if (!keys.length) return;
    const { error } = await this.client.storage.from(bucket).remove(keys);
    signal.throwIfAborted();
    if (error)
      throw new ApplicationError("RF_UNAVAILABLE", 503, "Private file cleanup will be retried.");
  }
}
