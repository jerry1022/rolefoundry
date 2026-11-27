import { z } from "zod";
import type { Actor } from "../identity/core";
import { ApplicationError } from "../platform/errors";
import {
  courseQuerySchema,
  courseSourceSchema,
  courseDraftSchema,
  planRequestSchema,
  resourceUrl,
} from "./model";
import type {
  CourseCatalog,
  LearningRepository,
  LearningAdministration,
  LearningAuthorization,
} from "./ports";
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApplicationError("RF_INVALID_INPUT", 400, "Check the learning fields and versions.");
  return result.data;
}
const revision = z.number().int().nonnegative(),
  completion = z.object({ expectedRevision: revision, completed: z.boolean() }).strict();
export class CourseCatalogService {
  constructor(private readonly repository: CourseCatalog) {}
  list(input: unknown) {
    return this.repository.list(parse(courseQuerySchema, input));
  }
  find(id: unknown) {
    return this.repository.find(parse(z.uuid(), id));
  }
}
export class LearningService {
  constructor(
    private readonly repository: LearningRepository,
    private readonly auth: LearningAuthorization,
  ) {}
  private allow(actor: Actor, write = false) {
    return this.auth.authorize(actor, write ? "learning:write" : "learning:read", actor.userId);
  }
  async plan(actor: Actor, input: unknown, key: unknown) {
    await this.allow(actor, true);
    return this.repository.start(
      parse(planRequestSchema, input),
      parse(z.string().min(8).max(200), key),
    );
  }
  async find(actor: Actor, id: unknown) {
    await this.allow(actor);
    return this.repository.find(parse(z.uuid(), id));
  }
  async list(actor: Actor, cursor?: unknown) {
    await this.allow(actor);
    return this.repository.list(
      cursor === undefined ? undefined : parse(z.string().min(1).max(128), cursor),
    );
  }
  async progress(actor: Actor) {
    await this.allow(actor);
    return this.repository.progress();
  }
  async courseProgress(actor: Actor, id: unknown, input: unknown) {
    await this.allow(actor, true);
    const data = parse(completion, input);
    return this.repository.courseProgress(
      parse(z.uuid(), id),
      data.expectedRevision,
      data.completed,
    );
  }
  async stepProgress(actor: Actor, planId: unknown, stepId: unknown, input: unknown) {
    await this.allow(actor, true);
    const data = parse(completion, input);
    return this.repository.stepProgress(
      parse(z.uuid(), planId),
      parse(z.uuid(), stepId),
      data.expectedRevision,
      data.completed,
    );
  }
  async practice(actor: Actor, planId: unknown, stepId: unknown, input: unknown) {
    await this.allow(actor, true);
    return this.repository.practice(
      parse(z.uuid(), planId),
      parse(z.uuid(), stepId),
      parse(
        z
          .object({
            expectedRevision: revision,
            url: resourceUrl,
            summary: z.string().trim().min(1).max(1000),
          })
          .strict(),
        input,
      ),
    );
  }
  async removePractice(actor: Actor, planId: unknown, submissionId: unknown, input: unknown) {
    await this.allow(actor, true);
    const data = parse(z.object({ expectedRevision: revision }).strict(), input);
    return this.repository.removePractice(
      parse(z.uuid(), planId),
      parse(z.uuid(), submissionId),
      data.expectedRevision,
    );
  }
}
export class LearningAdministrationService {
  constructor(
    private readonly repository: LearningAdministration,
    private readonly auth: LearningAuthorization,
  ) {}
  private allow(actor: Actor) {
    return this.auth.authorize(actor, "catalog:write");
  }
  async bank(actor: Actor) {
    await this.allow(actor);
    return this.repository.bank();
  }
  async source(actor: Actor, input: unknown) {
    await this.allow(actor);
    return this.repository.source(parse(courseSourceSchema, input));
  }
  async sourceStatus(actor: Actor, id: unknown, input: unknown) {
    await this.allow(actor);
    const data = parse(
      z
        .object({
          status: z.enum(["active", "revoked"]),
          reason: z.string().trim().min(1).max(1000),
        })
        .strict(),
      input,
    );
    return this.repository.sourceStatus(parse(z.uuid(), id), data.status, data.reason);
  }
  async create(actor: Actor, input: unknown) {
    await this.allow(actor);
    return this.repository.create(parse(courseDraftSchema, input));
  }
  async revise(actor: Actor, id: unknown, input: unknown) {
    await this.allow(actor);
    const data = parse(
      z.object({ expectedRevision: revision, course: courseDraftSchema }).strict(),
      input,
    );
    return this.repository.revise(parse(z.uuid(), id), data.course, data.expectedRevision);
  }
  async transition(actor: Actor, id: unknown, input: unknown) {
    await this.allow(actor);
    return this.repository.transition(
      parse(z.uuid(), id),
      parse(
        z
          .object({
            expectedRevision: revision,
            action: z.enum(["review", "publish", "retire", "confirmed_active", "network_failure"]),
            reason: z.string().trim().min(1).max(1000),
          })
          .strict(),
        input,
      ),
    );
  }
}
