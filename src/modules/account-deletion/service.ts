import { z } from "zod";
import type { Actor } from "../identity/core";
import { ApplicationError } from "../platform/errors";
import { deletionRequestSchema, deletionReceiptSchema, resumeReasonSchema } from "./model";
import type { DeletionRepository, DeletionAuthorization } from "./ports";
export class AccountDeletionService {
  constructor(
    private readonly store: DeletionRepository,
    private readonly auth: DeletionAuthorization,
  ) {}
  private parse<T>(schema: z.ZodType<T>, input: unknown) {
    const result = schema.safeParse(input);
    if (!result.success)
      throw new ApplicationError(
        "RF_INVALID_INPUT",
        400,
        "Check the deletion confirmation or private receipt.",
      );
    return result.data;
  }
  async request(actor: Actor, input: unknown) {
    await this.auth.authorize(actor, "account:delete", actor.userId);
    return this.store.request(this.parse(deletionRequestSchema, input));
  }
  status(input: unknown) {
    return this.store.status(this.parse(deletionReceiptSchema, input));
  }
  async resume(actor: Actor, id: unknown, reason: unknown) {
    await this.auth.authorize(actor, "account:delete-recovery");
    return this.store.resume(this.parse(z.uuid(), id), this.parse(resumeReasonSchema, reason));
  }
  async find(actor: Actor, id: unknown) {
    await this.auth.authorize(actor, "account:delete-recovery");
    return this.store.find(this.parse(z.uuid(), id));
  }
}
