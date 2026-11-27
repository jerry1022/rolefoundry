import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaskLease } from "../../tasks/model";
import { TaskFailure } from "../../tasks/model";
import type {
  ResumeParseStore,
  ResumeRevisionStore,
  ResumeExportStore,
  PrivateResumeStorage,
  ResumeDigest,
  ResumeCleanupRepository,
} from "../ports";
import {
  resumeVersionSchema,
  revisionInputSchema,
  resumeMediaSchema,
  parseSourceSchema,
} from "../model";
import type { ExtractedResume, ResumeRevisionOutput, ProcessingCode } from "../model";
import { resumeWorkerRpc } from "./rpc";
const authority = (lease: TaskLease) => ({ p_task: lease.taskId, p_token: lease.token });
export class SupabaseResumeParseStore implements ResumeParseStore {
  constructor(
    private readonly client: SupabaseClient,
    private readonly storage: PrivateResumeStorage,
    private readonly digest: ResumeDigest,
  ) {}
  async load(lease: TaskLease, signal: AbortSignal) {
    const input = z
      .object({
        sourceKind: z.enum(["file", "text"]),
        key: z.string().nullable(),
        hash: z.string(),
        mediaType: resumeMediaSchema.nullable(),
        byteCount: z.number().int().positive().nullable(),
        text: z.string().nullable(),
      })
      .parse(await resumeWorkerRpc(this.client, "resume_parse_load", authority(lease), signal));
    if (input.sourceKind === "text")
      return parseSourceSchema.parse({ sourceKind: "text", text: input.text });
    if (!input.key) throw new TaskFailure("validation");
    const bytes = await this.storage.get(input.key, signal);
    if (this.digest.sha256(bytes) !== input.hash) throw new TaskFailure("validation");
    // A second authority check prevents a deleted/revoked source from reaching the parser.
    await resumeWorkerRpc(this.client, "resume_parse_load", authority(lease), signal);
    return parseSourceSchema.parse({
      sourceKind: "file",
      mediaType: input.mediaType,
      byteCount: input.byteCount,
      bytes,
    });
  }
  async publish(lease: TaskLease, draft: ExtractedResume, signal: AbortSignal) {
    await resumeWorkerRpc(
      this.client,
      "resume_parse_publish",
      { ...authority(lease), p_draft: draft },
      signal,
    );
  }
  async failed(lease: TaskLease, code: ProcessingCode, signal: AbortSignal) {
    await resumeWorkerRpc(
      this.client,
      "resume_processing_failed",
      { ...authority(lease), p_code: code },
      signal,
    );
  }
}
export class SupabaseResumeRevisionStore implements ResumeRevisionStore {
  constructor(private readonly client: SupabaseClient) {}
  async load(lease: TaskLease, signal: AbortSignal) {
    return revisionInputSchema.parse(
      await resumeWorkerRpc(this.client, "resume_revision_load", authority(lease), signal),
    );
  }
  async publish(lease: TaskLease, proposal: ResumeRevisionOutput, signal: AbortSignal) {
    await resumeWorkerRpc(
      this.client,
      "resume_revision_publish",
      { ...authority(lease), p_output: proposal },
      signal,
    );
  }
}
export class SupabaseResumeExportStore implements ResumeExportStore {
  constructor(
    private readonly client: SupabaseClient,
    private readonly storage: PrivateResumeStorage,
    private readonly digest: ResumeDigest,
  ) {}
  async load(lease: TaskLease, signal: AbortSignal) {
    return resumeVersionSchema.parse(
      await resumeWorkerRpc(this.client, "resume_export_load", authority(lease), signal),
    );
  }
  async publish(lease: TaskLease, bytes: Uint8Array, signal: AbortSignal) {
    const key = z
      .string()
      .parse(await resumeWorkerRpc(this.client, "resume_export_prepare", authority(lease), signal));
    try {
      await this.storage.put(key, bytes, "application/pdf", signal);
    } catch {
      signal.throwIfAborted();
    }
    const actual = await this.storage.get(key, signal),
      hash = this.digest.sha256(bytes);
    if (actual.length !== bytes.length || this.digest.sha256(actual) !== hash)
      throw new TaskFailure("validation");
    await resumeWorkerRpc(
      this.client,
      "resume_export_publish",
      { ...authority(lease), p_key: key, p_sha256: hash, p_bytes: bytes.length },
      signal,
    );
  }
  async failed(lease: TaskLease, code: ProcessingCode, signal: AbortSignal) {
    await resumeWorkerRpc(
      this.client,
      "resume_processing_failed",
      { ...authority(lease), p_code: code },
      signal,
    );
  }
}
export class SupabaseResumeCleanupRepository implements ResumeCleanupRepository {
  constructor(private readonly client: SupabaseClient) {}
  async claim(signal: AbortSignal) {
    return z
      .array(z.object({ id: z.uuid(), key: z.string(), token: z.uuid() }))
      .parse(await resumeWorkerRpc(this.client, "resume_cleanup_claim", { p_limit: 10 }, signal));
  }
  async acknowledge(id: string, token: string, signal: AbortSignal) {
    await resumeWorkerRpc(this.client, "resume_cleanup_ack", { p_id: id, p_token: token }, signal);
  }
}
