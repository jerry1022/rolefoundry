import { z } from "zod";
import type { Actor } from "../identity/core";
import type {
  CatalogRepository,
  BookmarkRepository,
  CatalogAuthorization,
  CatalogAdminRepository,
} from "./ports";
import {
  querySchema,
  jobDraftSchema,
  sourcePolicySchema,
  sourceLinkSchema,
  jobTranslationInputSchema,
  jobTranslationRemovalSchema,
} from "./model";
import { ApplicationError } from "../platform/errors";
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApplicationError("RF_INVALID_INPUT", 400, "Check the catalog fields and try again.");
  return result.data;
}
export class JobCatalogService {
  constructor(private readonly repository: CatalogRepository) {}
  list(input: unknown) {
    return this.repository.list(parse(querySchema, input));
  }
  find(id: string) {
    if (!z.uuid().safeParse(id).success)
      throw new ApplicationError("RF_NOT_FOUND", 404, "The job is unavailable.");
    return this.repository.find(id);
  }
}
export class BookmarkService {
  constructor(
    private readonly repository: BookmarkRepository,
    private readonly auth: CatalogAuthorization,
  ) {}
  async list(actor: Actor, input: unknown) {
    await this.auth.authorize(actor, "bookmark:read", actor.userId);
    return this.repository.list(
      parse(
        z
          .object({
            limit: z.number().int().min(1).max(50).default(20),
            cursor: z.string().max(256).optional(),
          })
          .strict(),
        input,
      ),
    );
  }
  async save(actor: Actor, id: string) {
    await this.auth.authorize(actor, "bookmark:write", actor.userId);
    return this.repository.save(parse(z.uuid(), id));
  }
  async remove(actor: Actor, id: string) {
    await this.auth.authorize(actor, "bookmark:write", actor.userId);
    return this.repository.remove(parse(z.uuid(), id));
  }
}
export class CatalogAdminService {
  constructor(
    private readonly repository: CatalogAdminRepository,
    private readonly auth: CatalogAuthorization,
  ) {}
  private allow(actor: Actor) {
    return this.auth.authorize(actor, "catalog:write");
  }
  async source(actor: Actor, input: unknown) {
    await this.allow(actor);
    return this.repository.source(parse(sourcePolicySchema, input));
  }
  async sourceStatus(actor: Actor, id: string, input: unknown) {
    await this.allow(actor);
    const value = parse(z.object({ status: z.enum(["active", "revoked"]) }).strict(), input);
    return this.repository.sourceStatus(parse(z.uuid(), id), value.status);
  }
  async create(actor: Actor, input: unknown) {
    await this.allow(actor);
    return this.repository.create(
      parse(z.object({ job: jobDraftSchema, source: sourceLinkSchema }).strict(), input),
    );
  }
  async revise(actor: Actor, id: string, input: unknown) {
    await this.allow(actor);
    const value = parse(
      z.object({ expectedRevision: z.number().int().positive(), job: jobDraftSchema }).strict(),
      input,
    );
    return this.repository.revise(parse(z.uuid(), id), value.expectedRevision, value.job);
  }
  /** Stores reviewed text for the job's current version; the database rejects stale versions. */
  async translate(actor: Actor, id: string, input: unknown) {
    await this.allow(actor);
    return this.repository.translate(parse(z.uuid(), id), parse(jobTranslationInputSchema, input));
  }
  async removeTranslation(actor: Actor, id: string, input: unknown) {
    await this.allow(actor);
    return this.repository.removeTranslation(
      parse(z.uuid(), id),
      parse(jobTranslationRemovalSchema, input),
    );
  }
  async link(actor: Actor, id: string, input: unknown) {
    await this.allow(actor);
    return this.repository.link(parse(z.uuid(), id), parse(sourceLinkSchema, input));
  }
  async transition(actor: Actor, id: string, input: unknown) {
    await this.allow(actor);
    const value = parse(
      z
        .object({
          expectedRevision: z.number().int().positive(),
          status: z.enum(["draft", "review", "published", "expired", "rejected"]),
        })
        .strict(),
      input,
    );
    return this.repository.transition(parse(z.uuid(), id), value.expectedRevision, value.status);
  }
  async observe(actor: Actor, id: string, input: unknown) {
    await this.allow(actor);
    const value = parse(
      z
        .object({ event: z.enum(["confirmed_active", "confirmed_closed", "network_failure"]) })
        .strict(),
      input,
    );
    return this.repository.observe(parse(z.uuid(), id), value.event);
  }
}
