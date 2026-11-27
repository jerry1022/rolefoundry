import { z } from "zod";
export const linkReasons = [
  "ok",
  "not-found",
  "rate-limit",
  "unsupported",
  "access-denied",
  "redirect",
  "blocked",
  "timeout",
  "network",
  "http-error",
  "server-error",
  "invalid-response",
] as const;
export const linkResultSchema = z
  .object({
    reason: z.enum(linkReasons),
    httpStatus: z.number().int().min(100).max(599).nullable(),
    notBefore: z.iso.datetime().nullable(),
    manualPause: z.boolean(),
  })
  .strict();
export type LinkResult = z.infer<typeof linkResultSchema>;
export const linkTargetSchema = z
  .object({
    id: z.uuid(),
    versionId: z.uuid(),
    revision: z.number().int().positive(),
    lease: z.uuid(),
    url: z.string().max(2048),
    allowedHosts: z.array(z.string().max(253)).min(1).max(20),
  })
  .strict();
export type LinkTarget = z.infer<typeof linkTargetSchema>;
export const linkPolicySchema = z
  .object({
    sourceId: z.uuid(),
    allowedHosts: z
      .array(
        z
          .string()
          .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/)
          .max(253),
      )
      .min(1)
      .max(20),
  })
  .strict();
export type LinkPolicy = z.infer<typeof linkPolicySchema>;
export const linkQuerySchema = z
  .object({
    cursor: z.uuid().optional(),
    hostCursor: z
      .string()
      .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/)
      .max(253)
      .optional(),
  })
  .strict();
export const linkAdminSchema = z
  .object({
    checks: z
      .array(
        z
          .object({
            id: z.uuid(),
            title: z.string().max(200),
            versionId: z.uuid(),
            reason: z.enum(["unknown", ...linkReasons]),
            httpStatus: z.number().int().min(100).max(599).nullable(),
            checkedAt: z.iso.datetime({ offset: true }).nullable(),
            nextCheckAt: z.iso.datetime({ offset: true }),
            busy: z.boolean(),
          })
          .strict(),
      )
      .max(50),
    hosts: z
      .array(
        z
          .object({
            host: z.string().max(253),
            notBefore: z.iso.datetime({ offset: true }),
            manualPause: z.boolean(),
            revision: z.number().int().positive(),
          })
          .strict(),
      )
      .max(50),
    nextCursor: z.uuid().nullable(),
    nextHostCursor: z.string().max(253).nullable(),
  })
  .strict();
export const linkResumeSchema = z
  .object({
    host: z.string().max(253),
    expectedRevision: z.number().int().positive(),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();
export type LinkAdminPage = z.infer<typeof linkAdminSchema>;
