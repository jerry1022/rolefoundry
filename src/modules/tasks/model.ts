import { z } from "zod";
export const taskKinds = [
  "assessment.grade",
  "matches.refresh",
  "learning.plan",
  "resume.parse",
  "resume.revise",
  "resume.export",
  "catalog.import",
  "account.delete",
] as const;
export const taskKindSchema = z.enum(taskKinds);
export type TaskKind = z.infer<typeof taskKindSchema>;
export const taskStatusSchema = z.enum(["queued", "running", "succeeded", "failed"]);
export const failureCategorySchema = z.enum([
  "infrastructure",
  "timeout",
  "validation",
  "forbidden",
  "stale",
  "canceled",
]);
export type FailureCategory = z.infer<typeof failureCategorySchema>;
export const taskSchema = z.object({
  id: z.uuid(),
  kind: taskKindSchema,
  status: taskStatusSchema,
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  leaseExpiresAt: z.string().nullable(),
  resultRef: z.uuid().nullable(),
  errorCode: z.string().nullable(),
});
export type WorkTask = z.infer<typeof taskSchema>;
export const taskLeaseSchema = z.object({
  taskId: z.uuid(),
  messageId: z.string().regex(/^\d+$/),
  kind: taskKindSchema,
  token: z.uuid(),
  leaseSeconds: z.number().int().min(5).max(300),
});
export type TaskLease = z.infer<typeof taskLeaseSchema>;
export class TaskFailure extends Error {
  constructor(
    readonly category: FailureCategory,
    readonly retryAfterSeconds?: number,
  ) {
    super(`Task handler failed: ${category}`);
    if (
      retryAfterSeconds !== undefined &&
      (!Number.isInteger(retryAfterSeconds) || retryAfterSeconds < 0 || retryAfterSeconds > 86400)
    )
      throw new Error("Invalid task retry delay");
  }
}
