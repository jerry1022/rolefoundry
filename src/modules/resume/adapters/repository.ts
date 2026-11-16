import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResumeRepository } from "../ports";
import {
  resumeDocumentSchema,
  resumeSummarySchema,
  resumeVersionSchema,
  resumeUploadSchema,
  resumeMediaSchema,
  resumeDocumentTaskSchema,
  resumeTaskReplySchema,
  proposalSchema,
  downloadIntentSchema,
  deletionSchema,
} from "../model";
import { resumeRpc } from "./rpc";
import { ApplicationError } from "../../platform/errors";
export class SupabaseResumeRepository implements ResumeRepository {
  async retryParse(id: string, previousTaskId: string, key: string) {
    return resumeDocumentTaskSchema.parse(
      await resumeRpc(this.client, "resume_parse_retry", {
        p_id: id,
        p_previous: previousTaskId,
        p_key: key,
      }),
    );
  }
  constructor(
    private readonly client: SupabaseClient,
    private readonly privileged: SupabaseClient,
    private readonly ownerId: string,
  ) {}
  async list(cursor?: string) {
    let before: string | null = null;
    if (cursor) {
      try {
        before = z
          .string()
          .regex(/^\d+$/)
          .parse(JSON.parse(Buffer.from(cursor, "base64url").toString()));
      } catch {
        throw new ApplicationError(
          "RF_INVALID_INPUT",
          400,
          "The resume history cursor is invalid.",
        );
      }
    }
    const result = z
      .object({ data: z.array(resumeSummarySchema), lastSequence: z.string().nullable() })
      .parse(await resumeRpc(this.client, "resume_documents_list", { p_before: before }));
    return {
      data: result.data,
      nextCursor: result.lastSequence
        ? Buffer.from(JSON.stringify(result.lastSequence)).toString("base64url")
        : null,
    };
  }
  async find(id: string) {
    return resumeDocumentSchema.parse(
      await resumeRpc(this.client, "resume_document_find", { p_id: id }),
    );
  }
  async version(id: string) {
    return resumeVersionSchema.parse(
      await resumeRpc(this.client, "resume_version_find", { p_id: id }),
    );
  }
  async intent(input: Parameters<ResumeRepository["intent"]>[0], key: string) {
    return resumeUploadSchema.parse(
      await resumeRpc(this.client, "resume_upload_intent", { p_metadata: input, p_key: key }),
    );
  }
  async beginUpload(id: string, token: string, sha256: string, byteCount: number) {
    return z
      .object({
        alreadyUploaded: z.boolean(),
        key: z.string(),
        claim: z.uuid().nullable(),
        mediaType: resumeMediaSchema,
      })
      .parse(
        await resumeRpc(this.client, "resume_upload_begin", {
          p_id: id,
          p_token: token,
          p_sha256: sha256,
          p_bytes: byteCount,
        }),
      );
  }
  async finishUpload(id: string, claim: string, sha256: string, byteCount: number) {
    await resumeRpc(this.privileged, "resume_upload_finish", {
      p_user: this.ownerId,
      p_id: id,
      p_claim: claim,
      p_sha256: sha256,
      p_bytes: byteCount,
    });
  }
  async paste(text: string, key: string) {
    return resumeDocumentTaskSchema.parse(
      await resumeRpc(this.client, "resume_paste", { p_text: text, p_key: key }),
    );
  }
  async confirm(
    id: string,
    expectedRevision: number,
    content: Parameters<ResumeRepository["confirm"]>[2],
  ) {
    return resumeDocumentSchema.parse(
      await resumeRpc(this.client, "resume_confirm", {
        p_id: id,
        p_expected: expectedRevision,
        p_content: content,
      }),
    );
  }
  async revise(
    id: string,
    versionId: string,
    jobId: string,
    expectedRevision: number,
    key: string,
  ) {
    return resumeTaskReplySchema.parse(
      await resumeRpc(this.client, "resume_revision_start", {
        p_doc: id,
        p_version: versionId,
        p_job: jobId,
        p_expected: expectedRevision,
        p_key: key,
      }),
    );
  }
  async proposal(id: string) {
    return proposalSchema.parse(await resumeRpc(this.client, "resume_proposal_find", { p_id: id }));
  }
  async accept(id: string, expectedRevision: number, changeIds: string[]) {
    return resumeDocumentSchema.parse(
      await resumeRpc(this.client, "resume_accept", {
        p_id: id,
        p_expected: expectedRevision,
        p_ids: changeIds,
      }),
    );
  }
  async export(id: string, versionId: string, key: string) {
    return resumeTaskReplySchema.parse(
      await resumeRpc(this.client, "resume_export_start", {
        p_doc: id,
        p_version: versionId,
        p_key: key,
      }),
    );
  }
  async downloadIntent(exportId: string) {
    return downloadIntentSchema.parse(
      await resumeRpc(this.client, "resume_download_intent", { p_export: exportId }),
    );
  }
  async downloadAccess(id: string) {
    return z
      .object({
        key: z.string(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        byteCount: z.number().int().positive(),
        versionId: z.uuid(),
      })
      .parse(await resumeRpc(this.client, "resume_download_access", { p_id: id }));
  }
  async remove(id: string, expectedRevision: number) {
    return deletionSchema.parse(
      await resumeRpc(this.client, "resume_document_delete", {
        p_id: id,
        p_expected: expectedRevision,
      }),
    );
  }
}
