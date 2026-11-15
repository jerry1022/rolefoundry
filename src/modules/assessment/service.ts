import { z } from "zod";
import type { Actor } from "../identity/core";
import { tracks } from "../skills/catalog";
import { ApplicationError } from "../platform/errors";
import { saveAnswersSchema, submitSchema, rubricInputSchema, questionInputSchema } from "./model";
import type {
  AssessmentRepository,
  AssessmentAuthorization,
  AssessmentAdministrationRepository,
} from "./ports";
function parse<T>(schema: z.ZodType<T>, value: unknown) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApplicationError("RF_INVALID_INPUT", 400, "Check the assessment fields and answers.");
  return result.data;
}
export class AssessmentService {
  constructor(
    private readonly repository: AssessmentRepository,
    private readonly auth: AssessmentAuthorization,
  ) {}
  private allow(actor: Actor) {
    return this.auth.authorize(actor, "assessment:write", actor.userId);
  }
  async start(actor: Actor, input: unknown) {
    await this.allow(actor);
    return this.repository.start(parse(z.object({ track: z.enum(tracks) }).strict(), input).track);
  }
  async find(actor: Actor, id: string) {
    await this.allow(actor);
    return this.repository.find(parse(z.uuid(), id));
  }
  async list(actor: Actor, cursor?: string) {
    await this.allow(actor);
    return this.repository.list(cursor ? parse(z.string().max(128), cursor) : undefined);
  }
  async save(actor: Actor, id: string, input: unknown) {
    await this.allow(actor);
    return this.repository.save(parse(z.uuid(), id), parse(saveAnswersSchema, input));
  }
  async retry(actor: Actor, id: string, input: unknown) {
    await this.allow(actor);
    const value = parse(
      z.object({ previousTaskId: z.uuid(), idempotencyKey: z.string().min(8).max(200) }).strict(),
      input,
    );
    return this.repository.retry(parse(z.uuid(), id), value.previousTaskId, value.idempotencyKey);
  }
  async submit(actor: Actor, id: string, input: unknown) {
    await this.allow(actor);
    return this.repository.submit(parse(z.uuid(), id), parse(submitSchema, input));
  }
}
export class AssessmentAdministrationService {
  constructor(
    private readonly repository: AssessmentAdministrationRepository,
    private readonly auth: AssessmentAuthorization,
  ) {}
  private allow(actor: Actor) {
    return this.auth.authorize(actor, "catalog:write");
  }
  async bank(actor: Actor) {
    await this.allow(actor);
    return this.repository.bank();
  }
  async rubric(actor: Actor, input: unknown) {
    await this.allow(actor);
    return this.repository.rubric(parse(rubricInputSchema, input));
  }
  async question(actor: Actor, input: unknown) {
    await this.allow(actor);
    return this.repository.question(parse(questionInputSchema, input));
  }
  async review(actor: Actor, id: string, input: unknown) {
    await this.allow(actor);
    await this.repository.review(
      parse(z.uuid(), id),
      parse(z.object({ reason: z.string().trim().min(1).max(1000) }).strict(), input).reason,
    );
  }
  async retire(actor: Actor, id: string, input: unknown) {
    await this.allow(actor);
    await this.repository.retire(
      parse(z.uuid(), id),
      parse(z.object({ reason: z.string().trim().min(1).max(1000) }).strict(), input).reason,
    );
  }
}
