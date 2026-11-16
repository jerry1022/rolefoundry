import { z } from "zod";
import type { Actor } from "../identity/core";
import { ApplicationError } from "../platform/errors";
import {
  uuid,
  trackSchema,
  editSchema,
  followUpSchema,
  followUpEditSchema,
  expectedSchema,
} from "./model";
import type { ApplicationRepository, ApplicationAuthorization } from "./ports";
const key = z.string().min(8).max(200),
  cursor = z.string().min(1).max(256);
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApplicationError(
      "RF_INVALID_INPUT",
      400,
      "Check the application fields and revision.",
    );
  return result.data;
}
export class ApplicationService {
  constructor(
    private readonly repository: ApplicationRepository,
    private readonly auth: ApplicationAuthorization,
  ) {}
  private allow(actor: Actor, write = false) {
    return this.auth.authorize(
      actor,
      write ? "applications:write" : "applications:read",
      actor.userId,
    );
  }
  async list(actor: Actor, value?: unknown) {
    await this.allow(actor);
    return this.repository.list(value === undefined ? undefined : parse(cursor, value));
  }
  async resumeChoices(actor: Actor, value?: unknown) {
    await this.allow(actor);
    return this.repository.resumeChoices(value === undefined ? undefined : parse(cursor, value));
  }
  async find(actor: Actor, id: unknown) {
    await this.allow(actor);
    return this.repository.find(parse(uuid, id));
  }
  async events(actor: Actor, id: unknown, value?: unknown) {
    await this.allow(actor);
    return this.repository.events(
      parse(uuid, id),
      value === undefined ? undefined : parse(cursor, value),
    );
  }
  async track(actor: Actor, input: unknown, requestKey: unknown) {
    await this.allow(actor, true);
    return this.repository.track(parse(trackSchema, input), parse(key, requestKey));
  }
  async edit(actor: Actor, id: unknown, input: unknown) {
    await this.allow(actor, true);
    return this.repository.edit(parse(uuid, id), parse(editSchema, input));
  }
  async newCycle(actor: Actor, id: unknown, input: unknown, requestKey: unknown) {
    await this.allow(actor, true);
    return this.repository.newCycle(
      parse(uuid, id),
      parse(expectedSchema, input).expectedRevision,
      parse(key, requestKey),
    );
  }
  async addFollowUp(actor: Actor, id: unknown, input: unknown, requestKey: unknown) {
    await this.allow(actor, true);
    return this.repository.addFollowUp(
      parse(uuid, id),
      parse(followUpSchema, input),
      parse(key, requestKey),
    );
  }
  async editFollowUp(actor: Actor, id: unknown, followUpId: unknown, input: unknown) {
    await this.allow(actor, true);
    return this.repository.editFollowUp(
      parse(uuid, id),
      parse(uuid, followUpId),
      parse(followUpEditSchema, input),
    );
  }
  async removeFollowUp(actor: Actor, id: unknown, followUpId: unknown, input: unknown) {
    await this.allow(actor, true);
    return this.repository.removeFollowUp(
      parse(uuid, id),
      parse(uuid, followUpId),
      parse(expectedSchema, input).expectedRevision,
    );
  }
  async remove(actor: Actor, id: unknown, input: unknown) {
    await this.allow(actor, true);
    return this.repository.remove(parse(uuid, id), parse(expectedSchema, input).expectedRevision);
  }
}
