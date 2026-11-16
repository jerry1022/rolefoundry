import { z } from "zod";
import type { Actor } from "../identity/core";
import { ApplicationError } from "../platform/errors";
import { refreshMatchSchema } from "./model";
import type { MatchingAuthorization, MatchingRepository } from "./ports";
function parse<T>(schema: z.ZodType<T>, value: unknown) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApplicationError("RF_INVALID_INPUT", 400, "Check the matching request and versions.");
  return result.data;
}
export class MatchingService {
  constructor(
    private readonly repository: MatchingRepository,
    private readonly auth: MatchingAuthorization,
  ) {}
  async refresh(actor: Actor, input: unknown, key: unknown) {
    await this.auth.authorize(actor, "matches:write", actor.userId);
    return this.repository.refresh(
      parse(refreshMatchSchema, input),
      parse(z.string().min(8).max(200), key),
    );
  }
  async find(actor: Actor, id: unknown, cursor?: unknown) {
    await this.auth.authorize(actor, "matches:read", actor.userId);
    return this.repository.find(
      parse(z.uuid(), id),
      cursor === undefined ? undefined : parse(z.string().min(1).max(128), cursor),
    );
  }
  async list(actor: Actor, cursor?: unknown) {
    await this.auth.authorize(actor, "matches:read", actor.userId);
    return this.repository.list(
      cursor === undefined ? undefined : parse(z.string().min(1).max(128), cursor),
    );
  }
}
