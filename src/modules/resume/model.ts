import { z } from "zod";
import limits from "./limits.json";
import { skillIdSchema } from "../skills/model";
export const resumeLimits = limits;
const uuid = z.uuid().transform((value) => value.toLowerCase());
export const resumeMediaSchema = z.enum([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
export type ResumeMedia = z.infer<typeof resumeMediaSchema>;
const plainText = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine(
      (value) =>
        value.trim().length > 0 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
    );
export const uploadIntentSchema = z
  .object({
    filename: z
      .string()
      .trim()
      .min(1)
      .max(180)
      .refine((value) => !/[\x00-\x1f/\\]/.test(value)),
    mediaType: resumeMediaSchema,
    byteCount: z.number().int().positive().max(resumeLimits.sourceBytes),
  })
  .strict()
  .refine((value) =>
    value.filename.toLowerCase().endsWith(value.mediaType === "application/pdf" ? ".pdf" : ".docx"),
  );
export const sourceSpanSchema = z
  .object({
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
    page: z.number().int().positive().max(resumeLimits.sourcePages).nullable(),
  })
  .strict()
  .refine((value) => value.end > value.start);
export const extractedResumeSchema = z
  .object({
    text: plainText(resumeLimits.textCharacters),
    blocks: z
      .array(
        z
          .object({
            id: uuid,
            text: plainText(10_000),
            source: sourceSpanSchema,
          })
          .strict(),
      )
      .min(1)
      .max(resumeLimits.blocks),
    pageCount: z.number().int().positive().max(resumeLimits.sourcePages).nullable(),
    warnings: z.array(
      z.enum(["layout-not-preserved", "review-extracted-text", "document-warnings"]),
    ),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = new Set<string>();
    let end = -1;
    for (const block of value.blocks) {
      if (
        ids.has(block.id) ||
        block.source.start < end ||
        value.text.slice(block.source.start, block.source.end) !== block.text ||
        (block.source.page !== null &&
          (value.pageCount === null || block.source.page > value.pageCount))
      )
        context.addIssue({ code: "custom", message: "Invalid source spans." });
      ids.add(block.id);
      end = block.source.end;
    }
  });
export type ExtractedResume = z.infer<typeof extractedResumeSchema>;
export const resumeFactSchema = z
  .object({
    id: uuid,
    text: plainText(4_000),
    kind: z.enum([
      "experience",
      "project",
      "education",
      "credential",
      "skill-claim",
      "contact",
      "other",
    ]),
    state: z.enum(["completed", "in-progress", "learning", "unspecified"]),
    skillIds: z.array(skillIdSchema).max(20),
    sourceBlockId: uuid.nullable(),
  })
  .strict()
  .refine((value) => new Set(value.skillIds).size === value.skillIds.length);
export type ResumeFact = z.infer<typeof resumeFactSchema>;
export const resumeSectionSchema = z
  .object({
    id: uuid,
    heading: plainText(120),
    factIds: z.array(uuid).min(1).max(resumeLimits.facts),
  })
  .strict();
export const confirmedResumeSchema = z
  .object({
    facts: z.array(resumeFactSchema).min(1).max(resumeLimits.facts),
    sections: z.array(resumeSectionSchema).min(1).max(resumeLimits.sections),
  })
  .strict()
  .superRefine((value, context) => {
    const factIds = value.facts.map((f) => f.id),
      referenced = value.sections.flatMap((s) => s.factIds);
    if (
      new Set(factIds).size !== factIds.length ||
      new Set(value.sections.map((s) => s.id)).size !== value.sections.length ||
      new Set(referenced).size !== referenced.length ||
      referenced.length !== factIds.length ||
      referenced.some((id) => !factIds.includes(id)) ||
      value.facts.reduce((sum, fact) => sum + fact.text.length, 0) > resumeLimits.textCharacters
    )
      context.addIssue({
        code: "custom",
        message: "Each confirmed fact must belong to exactly one section.",
      });
  });
export type ConfirmedResume = z.infer<typeof confirmedResumeSchema>;
export const resumeVersionSchema = z
  .object({
    id: uuid,
    documentId: uuid,
    dictionaryVersion: z.number().int().positive().optional(),
    version: z.number().int().positive(),
    createdAt: z.string(),
    content: confirmedResumeSchema,
  })
  .strict();
export type ResumeVersion = z.infer<typeof resumeVersionSchema>;
export const revisionInputSchema = z
  .object({
    version: resumeVersionSchema,
    dictionaryVersion: z.number().int().positive().optional(),
    canonicalSkillIds: z.record(skillIdSchema, skillIdSchema).optional(),
    target: z
      .object({ jobId: uuid, jobVersionId: uuid, skillIds: z.array(skillIdSchema).max(200) })
      .strict(),
  })
  .strict();
export type ResumeRevisionInput = z.infer<typeof revisionInputSchema>;
export const revisionChangeSchema = z
  .object({
    id: uuid,
    sectionId: uuid,
    beforeText: z.string(),
    afterText: z.string(),
    factIds: z.array(uuid).min(1).max(resumeLimits.facts),
    reason: z.string().min(1).max(1000),
  })
  .strict();
export const revisionOutputSchema = z
  .object({
    recipe: z.literal("resume-order-v1"),
    versionId: uuid,
    jobVersionId: uuid,
    changes: z.array(revisionChangeSchema).max(resumeLimits.sections),
    questions: z.array(z.object({ skillId: skillIdSchema, prompt: z.string() })).max(200),
    limitations: z.array(z.string()).max(10),
  })
  .strict();
export type ResumeRevisionOutput = z.infer<typeof revisionOutputSchema>;
export const processingCodes = [
  "invalid-file",
  "unsupported-file",
  "too-large",
  "empty-text",
  "password-protected",
  "parse-timeout",
  "process-failed",
  "unsupported-glyph",
  "invalid-output",
] as const;
export type ProcessingCode = (typeof processingCodes)[number];
export class ResumeProcessingError extends Error {
  constructor(readonly code: ProcessingCode) {
    super(`Resume processing failed: ${code}`);
  }
}

export const resumeStatusSchema = z.enum([
  "awaiting-upload",
  "uploading",
  "queued",
  "running",
  "failed",
  "parsed",
  "confirmed",
]);
export const resumeTaskStatusSchema = z.enum(["queued", "running", "succeeded", "failed"]);
export const resumeSummarySchema = z.object({
  id: uuid,
  filename: z.string(),
  revision: z.number().int().positive(),
  status: resumeStatusSchema,
  createdAt: z.string(),
});
export const resumeListSchema = z.object({
  data: z.array(resumeSummarySchema),
  nextCursor: z.string().nullable(),
});
export const proposalSummarySchema = z.object({
  id: uuid,
  versionId: uuid,
  jobId: uuid,
  taskId: uuid.nullable(),
  status: z.enum(["queued", "running", "failed", "succeeded", "accepted"]),
  stale: z.boolean(),
  acceptedVersionId: uuid.nullable(),
  createdAt: z.string(),
});
export const resumeDocumentSchema = resumeSummarySchema.extend({
  sourceKind: z.enum(["file", "text"]),
  confirmedClaimCount: z.number().int().nonnegative(),
  taskErrorCode: z.string().nullable(),
  taskId: uuid.nullable(),
  draft: extractedResumeSchema.nullable(),
  processingError: z.enum(processingCodes).nullable(),
  currentVersion: resumeVersionSchema.nullable(),
  versions: z
    .array(z.object({ id: uuid, version: z.number().int().positive(), createdAt: z.string() }))
    .max(100),
  proposals: z.array(proposalSummarySchema).max(100),
  exports: z
    .array(
      z.object({
        id: uuid,
        versionId: uuid,
        taskId: uuid.nullable(),
        status: resumeTaskStatusSchema,
        processingError: z.enum(processingCodes).nullable(),
        createdAt: z.string(),
      }),
    )
    .max(100),
});
export type ResumeDocument = z.infer<typeof resumeDocumentSchema>;
export const proposalSchema = proposalSummarySchema.omit({ createdAt: true }).extend({
  documentId: uuid,
  output: revisionOutputSchema.nullable(),
  acceptedIds: z.array(uuid).nullable(),
});
export type ResumeProposal = z.infer<typeof proposalSchema>;
export const resumeTaskReplySchema = z.object({
  id: uuid,
  taskId: uuid,
  status: resumeTaskStatusSchema,
});
export const resumeDocumentTaskSchema = z.object({
  documentId: uuid,
  taskId: uuid,
  status: resumeTaskStatusSchema,
});
export const resumeUploadSchema = z.object({
  documentId: uuid,
  uploadToken: uuid,
  expiresAt: z.string(),
});
export const downloadIntentSchema = z.object({ id: uuid, expiresAt: z.string() });
export const deletionSchema = z.object({ deleted: z.literal(true), cleanupPending: z.boolean() });
export const parseSourceSchema = z.discriminatedUnion("sourceKind", [
  z
    .object({
      sourceKind: z.literal("file"),
      mediaType: resumeMediaSchema,
      byteCount: z.number().int().positive().max(resumeLimits.sourceBytes),
      bytes: z.instanceof(Uint8Array),
    })
    .strict()
    .refine((value) => value.bytes.length === value.byteCount),
  z
    .object({ sourceKind: z.literal("text"), text: plainText(resumeLimits.textCharacters) })
    .strict(),
]);
export type ResumeParseSource = z.infer<typeof parseSourceSchema>;
export type ResumeUploadInput = z.infer<typeof uploadIntentSchema>;
export type ResumeHistory = z.infer<typeof resumeListSchema>;
export type ResumeUploadAuthority = z.infer<typeof resumeUploadSchema>;
export type ResumeTaskReply = z.infer<typeof resumeTaskReplySchema>;
export type ResumeTaskReference = z.infer<typeof resumeDocumentTaskSchema>;
export type ResumeDownloadAuthority = z.infer<typeof downloadIntentSchema>;
export type ResumeDeletion = z.infer<typeof deletionSchema>;
