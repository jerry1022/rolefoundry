import type { z } from "zod";
import type { Actor } from "../identity/core";
import type {
  SkillDictionary,
  SkillResolution,
  resolveInputSchema,
  createSkillSchema,
  updateSkillSchema,
  addAliasSchema,
  addRelationSchema,
  setTrackSkillSchema,
  mergeSkillSchema,
  removeAliasSchema,
  removeTrackSchema,
} from "./model";
export interface SkillRepository {
  get(version?: number): Promise<SkillDictionary>;
  resolve(input: z.infer<typeof resolveInputSchema>): Promise<SkillResolution>;
}
export interface SkillAdminRepository {
  removeAlias(input: z.infer<typeof removeAliasSchema>): Promise<{ version: number }>;
  removeRelation(input: z.infer<typeof addRelationSchema>): Promise<{ version: number }>;
  removeTrack(input: z.infer<typeof removeTrackSchema>): Promise<{ version: number }>;
  create(input: z.infer<typeof createSkillSchema>): Promise<{ version: number }>;
  update(id: string, input: z.infer<typeof updateSkillSchema>): Promise<{ version: number }>;
  alias(input: z.infer<typeof addAliasSchema>): Promise<{ version: number }>;
  relation(input: z.infer<typeof addRelationSchema>): Promise<{ version: number }>;
  track(input: z.infer<typeof setTrackSkillSchema>): Promise<{ version: number }>;
  merge(input: z.infer<typeof mergeSkillSchema>): Promise<{ version: number }>;
}
export interface SkillAuthorization {
  authorize(actor: Actor, action: string, ownerId?: string): Promise<void>;
}
export interface SkillClient extends SkillRepository {}
export interface SkillAdminClient extends SkillAdminRepository {}
