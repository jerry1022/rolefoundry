import { z } from "zod";
import type { Actor } from "../identity/core";
import { ApplicationError } from "../platform/errors";
import type { SkillRepository, SkillAdminRepository, SkillAuthorization } from "./ports";
import {
  resolveInputSchema,
  createSkillSchema,
  updateSkillSchema,
  addAliasSchema,
  addRelationSchema,
  setTrackSkillSchema,
  mergeSkillSchema,
  skillIdSchema,
  removeAliasSchema,
  removeTrackSchema,
} from "./model";
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new ApplicationError(
      "RF_INVALID_INPUT",
      400,
      "Check the dictionary fields and try again.",
    );
  return parsed.data;
}
export class SkillDictionaryService {
  constructor(private readonly repository: SkillRepository) {}
  get(version?: number) {
    return this.repository.get(
      version === undefined ? undefined : parse(z.number().int().positive(), version),
    );
  }
  resolve(input: unknown) {
    return this.repository.resolve(parse(resolveInputSchema, input));
  }
}
export class SkillAdministrationService {
  constructor(
    private readonly repository: SkillAdminRepository,
    private readonly authorization: SkillAuthorization,
  ) {}
  private allow(actor: Actor) {
    return this.authorization.authorize(actor, "catalog:write");
  }
  async create(actor: Actor, input: unknown) {
    await this.allow(actor);
    return this.repository.create(parse(createSkillSchema, input));
  }
  async update(actor: Actor, id: string, input: unknown) {
    await this.allow(actor);
    return this.repository.update(parse(skillIdSchema, id), parse(updateSkillSchema, input));
  }
  async alias(actor: Actor, input: unknown) {
    await this.allow(actor);
    return this.repository.alias(parse(addAliasSchema, input));
  }
  async relation(actor: Actor, input: unknown) {
    await this.allow(actor);
    return this.repository.relation(parse(addRelationSchema, input));
  }
  async track(actor: Actor, input: unknown) {
    await this.allow(actor);
    return this.repository.track(parse(setTrackSkillSchema, input));
  }
  async merge(actor: Actor, input: unknown) {
    await this.allow(actor);
    return this.repository.merge(parse(mergeSkillSchema, input));
  }
  async removeAlias(actor: Actor, input: unknown) {
    await this.allow(actor);
    return this.repository.removeAlias(parse(removeAliasSchema, input));
  }
  async removeRelation(actor: Actor, input: unknown) {
    await this.allow(actor);
    return this.repository.removeRelation(parse(addRelationSchema, input));
  }
  async removeTrack(actor: Actor, input: unknown) {
    await this.allow(actor);
    return this.repository.removeTrack(parse(removeTrackSchema, input));
  }
}
