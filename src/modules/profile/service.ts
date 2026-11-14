import { z } from "zod";
import type { Actor } from "../identity/core";
import type { ProfileAuthorization, ProfileRepository } from "./ports";
import {
  createEvidenceSchema,
  editEvidenceSchema,
  deleteEvidenceSchema,
  importProfileSchema,
  updateProfileSchema,
  skillSchema,
  ProfileError,
} from "./model";

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ProfileError("RF_INVALID_INPUT", 400);
  return result.data;
}
/** Framework- and database-independent use cases, assembled at the server boundary. */
export class ProfileService {
  constructor(
    private readonly repository: ProfileRepository,
    private readonly authorization: ProfileAuthorization,
  ) {}
  private allow(actor: Actor, action: string) {
    return this.authorization.authorize(actor, action, actor.userId);
  }
  async read(actor: Actor) {
    await this.allow(actor, "profile:read");
    return this.repository.read();
  }
  async update(actor: Actor, input: unknown) {
    await this.allow(actor, "profile:write");
    return this.repository.update(parse(updateProfileSchema, input));
  }
  async list(actor: Actor, input: unknown) {
    await this.allow(actor, "evidence:read");
    return this.repository.list(
      parse(
        z
          .object({
            skill: skillSchema.optional(),
            cursor: z.string().min(1).max(256).optional(),
            limit: z.number().int().min(1).max(50).default(20),
          })
          .strict(),
        input,
      ),
    );
  }
  async history(actor: Actor, id: string) {
    await this.allow(actor, "evidence:read");
    return this.repository.history(parse(z.uuid(), id));
  }
  async create(actor: Actor, input: unknown) {
    await this.allow(actor, "evidence:write");
    return this.repository.create(parse(createEvidenceSchema, input));
  }
  async edit(actor: Actor, id: string, input: unknown) {
    await this.allow(actor, "evidence:write");
    return this.repository.edit(parse(z.uuid(), id), parse(editEvidenceSchema, input));
  }
  async remove(actor: Actor, id: string, input: unknown) {
    await this.allow(actor, "evidence:write");
    return this.repository.remove(parse(z.uuid(), id), parse(deleteEvidenceSchema, input));
  }
  async importDemo(actor: Actor, input: unknown) {
    await this.allow(actor, "profile:write");
    return this.repository.importDemo(parse(importProfileSchema, input));
  }
}
