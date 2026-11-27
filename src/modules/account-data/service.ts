import { z } from "zod";
import type { Actor } from "../identity/core";
import { ApplicationError } from "../platform/errors";
import type { AccountDataAuthorization, AccountExportRepository } from "./ports";
export class AccountDataService {
  constructor(
    private readonly store: AccountExportRepository,
    private readonly auth: AccountDataAuthorization,
  ) {}
  private parse<T>(schema: z.ZodType<T>, value: unknown) {
    const result = schema.safeParse(value);
    if (!result.success)
      throw new ApplicationError(
        "RF_INVALID_INPUT",
        400,
        "Check the export request or identifier.",
      );
    return result.data;
  }
  private async authorize(actor: Actor) {
    await this.auth.authorize(actor, "account:export", actor.userId);
  }
  async request(actor: Actor, key: unknown) {
    await this.authorize(actor);
    return this.store.request(this.parse(z.string().regex(/^[a-zA-Z0-9_-]{8,120}$/), key));
  }
  async list(actor: Actor, cursor?: unknown) {
    await this.authorize(actor);
    return this.store.list(
      cursor === undefined ? undefined : this.parse(z.string().min(1).max(256), cursor),
    );
  }
  async remove(actor: Actor, id: unknown) {
    await this.authorize(actor);
    return this.store.remove(this.parse(z.uuid(), id));
  }
  async access(actor: Actor, id: unknown) {
    await this.authorize(actor);
    return this.store.access(this.parse(z.uuid(), id));
  }
}
