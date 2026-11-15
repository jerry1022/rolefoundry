import { z } from "zod";
import { ApplicationError } from "../platform/errors";
import { tracks } from "../skills/catalog";
import { skillIdSchema as skillSchema } from "../skills/model";
export { skillIdSchema as skillSchema } from "../skills/model";

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value));
export const revisionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const preferencesSchema = z
  .object({
    name: text(100),
    track: z.enum(tracks),
    workplaces: z
      .array(z.enum(["Remote", "Hybrid", "On-site"]))
      .max(3)
      .refine((v) => new Set(v).size === v.length),
    weeklyHours: z.number().int().min(0).max(80),
  })
  .strict();
export type Preferences = z.infer<typeof preferencesSchema>;
export const profileSchema = preferencesSchema.extend({
  revision: revisionSchema,
  updatedAt: z.string().nullable(),
});
export type CareerProfile = z.infer<typeof profileSchema>;
export const updateProfileSchema = preferencesSchema
  .extend({ expectedRevision: revisionSchema })
  .strict();
export const portfolioUrlSchema = z
  .url()
  .max(2048)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  }, "Use an HTTPS reference without embedded credentials.");
const commonEvidence = {
  label: text(160).refine((v) => v.length > 0),
  context: text(2000),
  observedAt: z.iso.datetime({ offset: true }),
  skills: z
    .array(skillSchema)
    .min(1)
    .max(9)
    .refine((v) => new Set(v).size === v.length),
};
export const publicEvidenceSchema = z.discriminatedUnion("source", [
  z
    .object({
      ...commonEvidence,
      source: z.literal("self-report"),
      claimedLevel: z.number().int().min(0).max(3),
    })
    .strict(),
  z
    .object({
      ...commonEvidence,
      source: z.literal("portfolio-reference"),
      url: portfolioUrlSchema,
    })
    .strict(),
]);
export type PublicEvidenceInput = z.infer<typeof publicEvidenceSchema>;
export const createEvidenceSchema = z
  .object({ expectedRevision: revisionSchema, evidence: publicEvidenceSchema })
  .strict();
export const editEvidenceSchema = createEvidenceSchema
  .extend({ expectedVersion: z.number().int().positive() })
  .strict();
export const deleteEvidenceSchema = z
  .object({ expectedRevision: revisionSchema, expectedVersion: z.number().int().positive() })
  .strict();
export const internalEvidenceSchema = z
  .object({
    ...commonEvidence,
    source: z.enum(["scenario", "resume-claim"]),
    sourceRef: z.uuid(),
    sourceVersion: text(200).refine((v) => v.length > 0),
    rubricVersion: text(200).nullable(),
    dictionaryVersion: z.number().int().positive().optional(),
    outcome: text(2000),
  })
  .strict()
  .refine((v) => v.source !== "scenario" || !!v.rubricVersion);
export type InternalEvidenceInput = z.infer<typeof internalEvidenceSchema>;
export const evidenceSchema = z.object({
  id: z.uuid(),
  versionId: z.uuid(),
  version: z.number().int().positive(),
  source: z.enum(["self-report", "portfolio-reference", "scenario", "resume-claim"]),
  label: z.string(),
  context: z.string(),
  observedAt: z.string(),
  createdAt: z.string(),
  skills: z.array(skillSchema),
  canonicalSkills: z.array(skillSchema).optional(),
  skillLabels: z.record(z.string(), z.string()).optional(),
  dictionaryVersion: z.number().int().positive().optional(),
  claimedLevel: z.number().nullable(),
  url: z.string().nullable(),
  sourceRef: z.string().nullable(),
  sourceVersion: z.string(),
  rubricVersion: z.string().nullable(),
  outcome: z.string().nullable(),
  reviewState: z.enum(["unreviewed", "scored"]),
});
export type CapabilityEvidence = z.infer<typeof evidenceSchema>;
export const evidencePageSchema = z.object({
  data: z.array(evidenceSchema),
  nextCursor: z.string().nullable(),
  revision: revisionSchema,
  dictionaryVersion: z.number().int().positive(),
});
export type EvidencePage = z.infer<typeof evidencePageSchema>;
export const importProfileSchema = z
  .object({
    expectedRevision: revisionSchema,
    preferences: preferencesSchema,
    skills: z
      .array(skillSchema)
      .max(9)
      .refine((v) => new Set(v).size === v.length),
  })
  .strict();
export function isProfileSnapshotStale(inputRevision: number, currentRevision: number) {
  return inputRevision !== currentRevision;
}

export class ProfileError extends ApplicationError {
  constructor(
    readonly code:
      "RF_INVALID_INPUT" | "RF_CONFLICT" | "RF_NOT_FOUND" | "RF_FORBIDDEN" | "RF_UNAVAILABLE",
    readonly status: number,
  ) {
    super(
      code,
      status,
      {
        RF_INVALID_INPUT: "Check the profile fields and try again.",
        RF_CONFLICT: "Your profile changed. Reload before saving again.",
        RF_NOT_FOUND: "The evidence is unavailable.",
        RF_FORBIDDEN: "This evidence can only be changed by its source service.",
        RF_UNAVAILABLE: "The profile service is temporarily unavailable.",
      }[code],
    );
  }
}
