import { z } from "zod";
import { tracks } from "../skills/catalog";
import { skillIdSchema as skillSchema } from "../skills/model";
import { careerPathIds } from "./specializations";
export const catalogText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v));
export const catalogUrl = z
  .url()
  .max(2048)
  .refine((v) => {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password;
  })
  .transform((v) => new URL(v).href);
export const jobLevels = ["Intern", "Entry", "Mid", "Senior", "Lead"] as const;
export const workplaces = ["Remote", "Hybrid", "On-site"] as const;
export const statuses = ["draft", "review", "published", "expired", "rejected"] as const;
export const publicationFields = [
  "title",
  "company",
  "track",
  "specialization",
  "location",
  "workplace",
  "level",
  "salary",
  "summary",
  "responsibilities",
  "requirements",
  "conditions",
] as const;
export const salarySchema = z
  .object({
    min: z.number().positive().nullable(),
    max: z.number().positive().nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    interval: z.enum(["hour", "month", "year"]),
  })
  .strict()
  .refine(
    (v) =>
      (v.min !== null || v.max !== null) && (v.min === null || v.max === null || v.min <= v.max),
  );
export const requirementSchema = z
  .object({
    text: catalogText(1000).min(1),
    priority: z.enum(["mandatory", "preferred"]),
    skills: z
      .array(skillSchema)
      .max(9)
      .refine((v) => new Set(v).size === v.length),
  })
  .strict();
export const jobDraftSchema = z
  .object({
    canonicalKey: catalogText(200).min(1),
    company: catalogText(200).min(1),
    title: catalogText(200).min(1),
    track: z.enum(tracks),
    specialization: z.enum(careerPathIds),
    location: catalogText(200).nullable(),
    workplace: z.enum(workplaces).nullable(),
    level: z.enum(jobLevels).nullable(),
    salary: salarySchema.nullable(),
    summary: catalogText(3000).min(1),
    responsibilities: z.array(catalogText(1000).min(1)).max(15),
    requirements: z.array(requirementSchema).min(1).max(20),
    conditions: z
      .object({
        workAuthorization: catalogText(500).nullable(),
        education: catalogText(500).nullable(),
        experienceYears: z.number().min(0).max(80).nullable(),
      })
      .strict(),
    expiresAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
export type JobDraft = z.infer<typeof jobDraftSchema>;
export const sourcePolicySchema = z
  .object({
    name: catalogText(160).min(1),
    publisher: catalogText(200).min(1),
    authorizationBasis: catalogText(2000).min(1),
    rightsSummary: catalogText(500).min(1),
    allowedHosts: z
      .array(z.string().regex(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/))
      .min(1)
      .max(20),
    permittedFields: z
      .array(z.enum(publicationFields))
      .min(1)
      .max(12)
      .refine((v) => new Set(v).size === v.length),
    isDemo: z.boolean(),
  })
  .strict();
export const sourceLinkSchema = z
  .object({ sourceId: z.uuid(), externalId: catalogText(200).min(1), url: catalogUrl })
  .strict();
export const querySchema = z
  .object({
    q: catalogText(200)
      .transform((v) => v.normalize("NFKC").replace(/\s+/g, " ").toLowerCase())
      .default(""),
    track: z.enum(tracks).optional(),
    specialization: z.enum(careerPathIds).optional(),
    workplace: z.enum(workplaces).optional(),
    location: catalogText(200).optional(),
    level: z.enum(jobLevels).optional(),
    limit: z.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(4096).optional(),
  })
  .strict();
export type JobQuery = z.infer<typeof querySchema>;
export const jobSourceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  publisher: z.string(),
  url: catalogUrl,
  rightsSummary: z.string(),
  isDemo: z.boolean(),
  freshness: z.enum(["current", "uncertain"]),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  lastValidatedAt: z.string().nullable(),
});
export const publishedJobSchema = jobDraftSchema.omit({ canonicalKey: true }).extend({
  id: z.uuid(),
  versionId: z.uuid(),
  version: z.number().int().positive(),
  revision: z.number().int().positive(),
  publishedAt: z.string(),
  sources: z.array(jobSourceSchema).min(1),
  dictionaryVersion: z.number().int().positive(),
  sourceDictionaryVersion: z.number().int().positive(),
  requirements: z.array(
    requirementSchema.extend({
      sourceSkills: z.array(skillSchema),
      skillLabels: z.record(z.string(), z.string()),
    }),
  ),
});
export type PublishedJob = z.infer<typeof publishedJobSchema>;
export const catalogPageSchema = z.object({
  data: z.array(publishedJobSchema),
  nextCursor: z.string().nullable(),
  revision: z.number().int().nonnegative(),
  recipe: z.literal("lexical-v1"),
  appliedFilters: z.record(z.string(), z.unknown()),
  counts: z.record(z.string(), z.number().int().nonnegative()),
});
export type CatalogPage = z.infer<typeof catalogPageSchema>;
export const bookmarkSchema = z.object({
  jobId: z.uuid(),
  versionId: z.uuid(),
  title: z.string(),
  company: z.string(),
  sourceUrl: catalogUrl,
  savedAt: z.string(),
  available: z.boolean(),
});
export type Bookmark = z.infer<typeof bookmarkSchema>;
export const bookmarkPageSchema = z.object({
  data: z.array(bookmarkSchema),
  nextCursor: z.string().nullable(),
  revision: z.number().int().nonnegative(),
});
export type BookmarkPage = z.infer<typeof bookmarkPageSchema>;
