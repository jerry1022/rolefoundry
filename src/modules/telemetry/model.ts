import { z } from "zod";
import { operationsSummarySchema } from "../operations/model";
import { taskKinds } from "../tasks/model";
export const apiFamilies = [
  "account.deletion",
  "account.exports",
  "admin.account-deletions",
  "admin.assessments",
  "admin.catalog",
  "admin.courses",
  "admin.imports",
  "admin.operations",
  "admin.skills",
  "applications",
  "assessments",
  "bookmarks",
  "courses",
  "evidence",
  "identity",
  "jobs",
  "learning-plans",
  "learning-progress",
  "matches",
  "profile",
  "resume-downloads",
  "resume-exports",
  "resume-revisions",
  "resume-versions",
  "resumes",
  "skills",
  "tasks",
] as const;
export const apiFamilySchema = z.enum(apiFamilies);
export type ApiFamily = z.infer<typeof apiFamilySchema>;
export const httpMethods = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "OTHER",
] as const;
export const latencyBoundsMs = [
  5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 2147483647,
] as const;
export const httpObservationSchema = z
  .object({
    family: apiFamilySchema,
    method: z.enum(httpMethods),
    status: z.number().int().min(100).max(599),
    durationMs: z.number().int().min(0).max(300000),
  })
  .strict();
export type HttpObservation = z.infer<typeof httpObservationSchema>;
const count = z
  .string()
  .regex(/^(0|[1-9]\d{0,18})$/)
  .refine((value) => BigInt(value) <= 9223372036854775807n);
const age = z.number().nonnegative().finite().nullable();
export const telemetrySnapshotSchema = z
  .object({
    observedAt: z.iso.datetime({ offset: true }),
    operations: operationsSummarySchema.extend({
      kinds: operationsSummarySchema.shape.kinds
        .max(taskKinds.length)
        .refine((rows) => new Set(rows.map((row) => row.kind)).size === rows.length),
    }),
    http: z
      .array(
        z
          .object({
            family: apiFamilySchema,
            method: z.enum(httpMethods),
            statusClass: z.number().int().min(1).max(5),
            upperMs: z
              .number()
              .int()
              .refine((value) => (latencyBoundsMs as readonly number[]).includes(value)),
            count,
            sumMs: count,
          })
          .strict(),
      )
      .max(apiFamilies.length * httpMethods.length * 5 * latencyBoundsMs.length),
    invalidations: z
      .array(
        z
          .object({
            consumer: z.enum(["matching", "learning", "resume"]),
            pending: z.number().int().nonnegative(),
            leased: z.number().int().nonnegative(),
            retrying: z.number().int().nonnegative(),
            oldestSeconds: age,
          })
          .strict(),
      )
      .max(3),
    sources: z
      .array(
        z
          .object({
            catalog: z.enum(["jobs", "courses"]),
            unreviewed: z.number().int().nonnegative(),
            published: z.number().int().nonnegative(),
            uncertain: z.number().int().nonnegative(),
            unavailable: z.number().int().nonnegative(),
            oldestReviewSeconds: age,
          })
          .strict(),
      )
      .max(2),
  })
  .strict();
export type TelemetrySnapshot = z.infer<typeof telemetrySnapshotSchema>;
