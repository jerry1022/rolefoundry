import { z } from "zod";
export const accountExportLimits = {
  jsonBytes: 16 * 1024 * 1024,
  fileBytes: 48 * 1024 * 1024,
  archiveBytes: 64 * 1024 * 1024,
  files: 100,
} as const;
export const accountExportSchema = z.object({
  id: z.uuid(),
  taskId: z.uuid().nullable(),
  status: z.enum(["queued", "running", "ready", "failed", "invalidated", "expired"]),
  createdAt: z.string(),
  expiresAt: z.string(),
  byteCount: z.number().int().positive().nullable(),
});
export type AccountExport = z.infer<typeof accountExportSchema>;
export const accountExportPageSchema = z.object({
  data: z.array(accountExportSchema).max(20),
  nextCursor: z.string().nullable(),
});
export type AccountExportPage = z.infer<typeof accountExportPageSchema>;
export const exportPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string(),
  account: z.object({
    id: z.uuid(),
    email: z.string(),
    createdAt: z.string(),
    lastSignInAt: z.string().nullable(),
    updatedAt: z.string().nullable().optional(),
    emailConfirmedAt: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    phoneConfirmedAt: z.string().nullable().optional(),
    userMetadata: z.record(z.string(), z.json()).optional(),
    identities: z
      .array(
        z.object({
          id: z.string(),
          provider: z.string(),
          createdAt: z.string().nullable(),
          updatedAt: z.string().nullable(),
          lastSignInAt: z.string().nullable(),
        }),
      )
      .optional(),
    role: z.enum(["member", "admin"]),
  }),
  data: z.record(z.string(), z.array(z.json())),
  files: z
    .array(
      z.object({
        key: z.string(),
        path: z
          .string()
          .regex(/^files\/[a-f0-9-]{36}\/(?:source\.(?:pdf|docx)|[a-f0-9-]{36}\.pdf)$/),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        byteCount: z
          .number()
          .int()
          .positive()
          .max(8 * 1024 * 1024),
      }),
    )
    .max(accountExportLimits.files),
});
export type ExportPayload = z.infer<typeof exportPayloadSchema>;
export const exportAccessSchema = z.object({
  key: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteCount: z.number().int().positive().max(accountExportLimits.archiveBytes),
});
export type ExportAccess = z.infer<typeof exportAccessSchema>;
