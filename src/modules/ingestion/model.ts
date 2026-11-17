import { z } from "zod";
import { jobDraftSchema, type JobDraft } from "../jobs/model";
import { courseDraftSchema, type CourseDraft } from "../learning/model";
import { dictionarySchema, type SkillDictionary } from "../skills/model";
export const ingestionLimits = {
  bytes: 2 * 1024 * 1024,
  rows: 100,
  rowBytes: 64 * 1024,
  depth: 16,
  contextBytes: 8 * 1024 * 1024,
  outputBytes: 4 * 1024 * 1024,
  redirects: 3,
  fetchDeadlineMs: 20000,
} as const;
export const importKindSchema = z.enum(["jobs", "courses"]);
export type ImportKind = z.infer<typeof importKindSchema>;
export const importFormatSchema = z.enum(["json", "csv"]);
export type ImportFormat = z.infer<typeof importFormatSchema>;
export const ingestionText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value));
export const importSourceSchema = z
  .object({
    id: z.uuid(),
    kind: importKindSchema,
    status: z.enum(["active", "revoked"]),
    fingerprint: z.string().min(1).max(200),
    allowedHosts: z
      .array(z.string().regex(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/))
      .min(1)
      .max(20),
    permittedFields: z.array(z.string()).max(20),
    allowClosure: z.boolean(),
    provider: z
      .object({
        id: z.string(),
        pathPrefixes: z.array(z.string()).min(1),
        urlIdentity: z.enum(["path", "origin-path"]),
      })
      .nullable(),
  })
  .strict();
export type ImportSource = z.infer<typeof importSourceSchema>;
export const issueCodes = [
  "invalid-record",
  "duplicate-external-id",
  "invalid-url",
  "forbidden-field",
  "invalid-field",
  "invalid-cell",
  "invalid-columns",
  "unmapped-skill",
  "ambiguous-skill",
  "required-field",
  "cross-source-match",
  "explicit-closure",
  "closure-not-permitted",
  "unchanged",
] as const;
export const importIssueSchema = z
  .object({ code: z.enum(issueCodes), field: z.string(), blocking: z.boolean() })
  .strict();
export type ImportIssue = z.infer<typeof importIssueSchema>;
export const acceptedRowSchema = z
  .object({
    position: z.number().int().positive(),
    externalId: ingestionText(200),
    url: z.string().max(2048),
    state: z.enum(["active", "closed"]),
    fields: z.record(z.string(), z.unknown()),
  })
  .strict();
export type ImportRow = z.infer<typeof acceptedRowSchema>;
export const rejectedRowSchema = z
  .object({
    position: z.number().int().positive(),
    externalId: ingestionText(200).nullable(),
    issues: z.array(importIssueSchema).min(1).max(30),
  })
  .strict();
export type RejectedRow = z.infer<typeof rejectedRowSchema>;
export const sanitizedImportSchema = z
  .object({
    rows: z.array(acceptedRowSchema).max(ingestionLimits.rows),
    rejected: z.array(rejectedRowSchema).max(ingestionLimits.rows),
    total: z.number().int().min(1).max(ingestionLimits.rows),
  })
  .strict()
  .refine((value) => value.rows.length + value.rejected.length === value.total);
export type SanitizedImport = z.infer<typeof sanitizedImportSchema>;
export const importTargetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("jobs"),
    id: z.uuid(),
    versionId: z.uuid(),
    revision: z.number().int().positive(),
    draft: jobDraftSchema,
  }),
  z.object({
    kind: z.literal("courses"),
    id: z.uuid(),
    versionId: z.uuid(),
    revision: z.number().int().positive(),
    draft: courseDraftSchema,
  }),
]);
export type ImportTarget = z.infer<typeof importTargetSchema>;
export const importContextSchema = z
  .object({
    source: importSourceSchema,
    dictionary: dictionarySchema,
    existing: z
      .array(
        z.object({
          externalId: ingestionText(200),
          url: z.string().max(2048),
          target: importTargetSchema,
        }),
      )
      .max(ingestionLimits.rows),
    matches: z
      .array(
        z.object({
          externalId: ingestionText(200),
          candidates: z
            .array(
              z.object({
                id: z.uuid(),
                title: z.string().max(200),
                company: z.string().max(200).nullable(),
              }),
            )
            .max(10),
        }),
      )
      .max(ingestionLimits.rows),
  })
  .strict();
export type ImportContext = z.infer<typeof importContextSchema>;
export const fieldChangeSchema = z
  .object({
    field: z.string().max(200),
    operation: z.enum(["set", "clear"]),
    before: z.unknown(),
    after: z.unknown(),
  })
  .strict();
export const normalizedRowSchema = z
  .object({
    position: z.number().int().positive(),
    externalId: ingestionText(200),
    url: z.string().max(2048),
    state: z.enum(["active", "closed"]),
    targetId: z.uuid().nullable(),
    targetVersionId: z.uuid().nullable(),
    targetRevision: z.number().int().positive().nullable(),
    sourceFields: z.record(z.string(), z.unknown()),
    candidate: z.record(z.string(), z.unknown()),
    changes: z.array(fieldChangeSchema).max(40),
    issues: z.array(importIssueSchema).max(100),
    unmappedSkills: z.array(z.string().max(200)).max(200),
    candidateIds: z.array(z.uuid()).max(10),
    disposition: z.enum(["pending-review", "unchanged", "closure"]),
  })
  .strict();
export type NormalizedRow = z.infer<typeof normalizedRowSchema>;
export const importOutputSchema = z
  .object({
    recipe: z.literal("import-normalize-v1"),
    sourceFingerprint: z.string(),
    dictionaryVersion: z.number().int().positive(),
    total: z.number().int().positive().max(ingestionLimits.rows),
    rows: z.array(normalizedRowSchema).max(ingestionLimits.rows),
    rejected: z.array(rejectedRowSchema).max(ingestionLimits.rows),
  })
  .strict()
  .refine((value) => value.rows.length + value.rejected.length === value.total);
export type ImportOutput = z.infer<typeof importOutputSchema>;
export type CatalogDraft = JobDraft | CourseDraft;
export type { SkillDictionary };
export class ImportFailure extends Error {
  constructor(
    readonly code:
      | "too-large"
      | "malformed-json"
      | "malformed-csv"
      | "invalid-envelope"
      | "revoked-source"
      | "invalid-context",
  ) {
    super(`Import validation failed: ${code}`);
  }
}
export class FeedFailure extends Error {
  constructor(
    readonly code:
      | "blocked"
      | "network"
      | "timeout"
      | "rate-limit"
      | "redirect"
      | "too-large"
      | "media-type"
      | "http-error",
    readonly retryAfterSeconds?: number,
    readonly requiresManualRetry = false,
  ) {
    super(`Feed retrieval failed: ${code}`);
  }
}
export const importTaskReplySchema = z.object({
  id: z.uuid(),
  taskId: z.uuid().nullable(),
  status: z.string(),
});
export const importSettingSchema = importSourceSchema.extend({
  name: z.string(),
  sourceStatus: z.enum(["active", "revoked"]),
  revision: z.number().int().nonnegative(),
  uploadsEnabled: z.boolean(),
});
export const importBatchSchema = z.object({
  id: z.uuid(),
  sourceId: z.uuid(),
  batchId: z.string(),
  revision: z.number().int().positive(),
  stage: z.enum(["queued", "review"]),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  errorCode: z.string().nullable(),
  taskId: z.uuid().nullable(),
  createdAt: z.string(),
  sourceCurrent: z.boolean(),
  total: z.number().int(),
  rejected: z.array(rejectedRowSchema),
  items: z
    .array(
      z.object({
        id: z.uuid(),
        revision: z.number().int().positive(),
        state: z.enum(["pending", "unchanged", "published", "rejected"]),
        normalized: normalizedRowSchema,
      }),
    )
    .max(100),
});
export type ImportBatch = z.infer<typeof importBatchSchema>;
export type ImportSetting = z.infer<typeof importSettingSchema>;
export const importBatchSummarySchema = importBatchSchema
  .omit({ items: true, rejected: true })
  .extend({ rejectedCount: z.number().int().nonnegative() });
export type ImportBatchSummary = z.infer<typeof importBatchSummarySchema>;
export const importReviewSchema = z.object({
  id: z.uuid(),
  revision: z.number().int().positive(),
  state: z.enum(["pending", "unchanged", "published", "rejected"]),
  normalized: normalizedRowSchema,
  previewId: z.uuid(),
  previewVersion: z.number().int().positive(),
  sourceId: z.uuid(),
  kind: importKindSchema,
  sourceCurrent: z.boolean(),
  dictionaryCurrent: z.boolean(),
  sourceLatest: z.boolean(),
  targetCurrent: z.boolean(),
  publication: z
    .object({
      id: z.uuid(),
      decision: z.string(),
      resourceId: z.uuid().nullable(),
      versionId: z.uuid().nullable(),
      createdAt: z.string(),
    })
    .nullable(),
});
export const importReviewPreparationSchema = z.object({
  content: sanitizedImportSchema,
  context: importContextSchema,
  position: z.number().int().min(1).max(100),
});
export const importReceiptSchema = z.object({
  id: z.uuid(),
  reviewId: z.uuid(),
  decision: z.enum(["publish", "reject", "close", "confirm"]),
  resourceId: z.uuid().nullable(),
  versionId: z.uuid().nullable(),
});
export type ImportReview = z.infer<typeof importReviewSchema>;
export type ImportReviewPreparation = z.infer<typeof importReviewPreparationSchema>;
export type ImportReceipt = z.infer<typeof importReceiptSchema>;
export type ImportTaskReply = z.infer<typeof importTaskReplySchema>;
