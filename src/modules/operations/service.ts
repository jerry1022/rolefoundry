import { z } from "zod";
import type { Actor } from "../identity/core";
import { ApplicationError } from "../platform/errors";
import { operationsQuerySchema } from "./model";
import type { OperationsAuthorization, OperationsReadStore } from "./ports";
export class OperationsService {
  constructor(
    private readonly store: OperationsReadStore,
    private readonly auth: OperationsAuthorization,
  ) {}
  private parse<T>(schema: z.ZodType<T>, input: unknown): T {
    const parsed = schema.safeParse(input);
    if (!parsed.success)
      throw new ApplicationError(
        "RF_INVALID_INPUT",
        400,
        "Check the task filters or resource identifier.",
      );
    return parsed.data;
  }
  async summary(actor: Actor) {
    await this.auth.authorize(actor, "operations:read");
    return this.store.summary();
  }
  async tasks(actor: Actor, query: unknown) {
    await this.auth.authorize(actor, "operations:read");
    return this.store.tasks(this.parse(operationsQuerySchema, query));
  }
  async task(actor: Actor, id: unknown) {
    await this.auth.authorize(actor, "operations:read");
    return this.store.task(this.parse(z.uuid(), id));
  }
  async events(actor: Actor, id: unknown, cursor?: unknown) {
    await this.auth.authorize(actor, "operations:read");
    return this.store.events(
      this.parse(z.uuid(), id),
      cursor === undefined ? undefined : this.parse(z.string().min(1).max(256), cursor),
    );
  }
  async workers(actor: Actor) {
    await this.auth.authorize(actor, "operations:read");
    return this.store.workers();
  }
}
