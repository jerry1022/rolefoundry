import { z } from "zod";
export const deletionReceiptSchema = z
  .object({ id: z.uuid(), secret: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
export type DeletionReceipt = z.infer<typeof deletionReceiptSchema>;
export const deletionRequestSchema = deletionReceiptSchema
  .extend({ confirmation: z.literal("DELETE") })
  .strict();
export const deletionStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["queued", "cleaning-files", "removing-account", "completed", "needs-attention"]),
  requestedAt: z.string(),
  completedAt: z.string().nullable(),
  retryAt: z.string().nullable(),
  failures: z.number().int().nonnegative(),
});
export type DeletionStatus = z.infer<typeof deletionStatusSchema>;
export const deletionSubjectSchema = z.object({
  id: z.uuid(),
  subjectId: z.uuid(),
  phase: z.enum(["queued", "cleaning-files", "removing-account"]),
});
export type DeletionSubject = z.infer<typeof deletionSubjectSchema>;
export const deletionFileSchema = z.object({
  bucket: z.enum(["rolefoundry-resumes", "rolefoundry-account-exports"]),
  key: z.string().min(1).max(1024),
});
export type DeletionFile = z.infer<typeof deletionFileSchema>;
export const resumeReasonSchema = z.enum([
  "storage-restored",
  "directory-restored",
  "configuration-restored",
  "operator-reviewed",
]);
export type ResumeReason = z.infer<typeof resumeReasonSchema>;
