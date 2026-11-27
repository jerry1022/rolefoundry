import { z } from "zod";
import { tracks, skillLabels } from "./catalog";
/** Production identifiers are extensible; demo storage still uses its seed-only union. */
export const skillIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/);
export const localeSchema = z.enum(["en", "zh-TW"]);
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v));
export function normalizeSkillTerm(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}
export const skillEntrySchema = z.object({
  id: skillIdSchema,
  nameEn: text(160).min(1),
  nameZhTw: text(160).min(1),
  description: text(2000),
  status: z.enum(["active", "deprecated", "merged"]),
  redirectTo: skillIdSchema.nullable(),
});
export type SkillEntry = z.infer<typeof skillEntrySchema>;
export const aliasSchema = z.object({
  skillId: skillIdSchema,
  locale: localeSchema,
  alias: text(200).min(1),
  normalizedAlias: z.string(),
});
export const relationSchema = z.object({
  parentId: skillIdSchema,
  childId: skillIdSchema,
  relation: z.enum(["broader-than", "prerequisite"]),
});
export const trackSkillSchema = z.object({
  track: z.enum(tracks),
  skillId: skillIdSchema,
  priority: z.number().int().min(1).max(100),
});
export const dictionarySchema = z.object({
  version: z.number().int().positive(),
  createdAt: z.string(),
  skills: z.array(skillEntrySchema),
  aliases: z.array(aliasSchema),
  relations: z.array(relationSchema),
  trackSkills: z.array(trackSkillSchema),
});
export type SkillDictionary = z.infer<typeof dictionarySchema>;
export const resolutionSchema = z.object({
  version: z.number().int().positive(),
  normalizedTerm: z.string(),
  status: z.enum(["resolved", "unresolved", "ambiguous"]),
  skillId: skillIdSchema.nullable(),
  candidates: z.array(skillIdSchema),
  redirectedFrom: skillIdSchema.nullable(),
});
export type SkillResolution = z.infer<typeof resolutionSchema>;
export const resolveInputSchema = z
  .object({
    term: text(200).min(1),
    locale: localeSchema.optional(),
    version: z.number().int().positive().optional(),
  })
  .strict();
const mutation = { expectedVersion: z.number().int().positive(), reason: text(1000).min(1) };
export const createSkillSchema = skillEntrySchema
  .pick({ id: true, nameEn: true, nameZhTw: true, description: true })
  .extend(mutation)
  .strict();
export const updateSkillSchema = skillEntrySchema
  .pick({ nameEn: true, nameZhTw: true, description: true })
  .extend({ ...mutation, status: z.enum(["active", "deprecated"]) })
  .strict();
export const addAliasSchema = aliasSchema.omit({ normalizedAlias: true }).extend(mutation).strict();
export const addRelationSchema = relationSchema.extend(mutation).strict();
export const setTrackSkillSchema = trackSkillSchema.extend(mutation).strict();
export const mergeSkillSchema = z
  .object({ ...mutation, fromId: skillIdSchema, toId: skillIdSchema })
  .strict();
export function skillLabel(id: string, labels?: Record<string, string>) {
  return labels?.[id] || (skillLabels as Record<string, string>)[id] || id;
}
export const removeAliasSchema = z
  .object({ ...mutation, locale: localeSchema, alias: text(200).min(1) })
  .strict();
export const removeTrackSchema = trackSkillSchema
  .omit({ priority: true })
  .extend(mutation)
  .strict();
