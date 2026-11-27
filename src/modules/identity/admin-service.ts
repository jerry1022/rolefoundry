import { z } from "zod";
import type { Actor } from "./core";
import type { IdentityAdminDirectoryStore } from "./admin";
import { ApplicationError } from "../platform/errors";
export class IdentityAdminDirectoryService {
  constructor(
    private readonly store: IdentityAdminDirectoryStore,
    private readonly auth: { authorize(actor: Actor, action: string): Promise<void> },
  ) {}
  private cursor(value: unknown) {
    const parsed = z.string().min(1).max(512).optional().safeParse(value);
    if (!parsed.success)
      throw new ApplicationError("RF_INVALID_INPUT", 400, "The administration cursor is invalid.");
    return parsed.data;
  }
  async invitations(actor: Actor, cursor?: unknown) {
    await this.auth.authorize(actor, "admin:invitations");
    return this.store.invitations(this.cursor(cursor));
  }
  async quotaPolicies(actor: Actor, cursor?: unknown) {
    await this.auth.authorize(actor, "admin:quotas");
    return this.store.quotaPolicies(this.cursor(cursor));
  }
  async revokeInvitation(actor: Actor, id: unknown) {
    await this.auth.authorize(actor, "admin:invitations");
    const parsed = z.uuid().safeParse(id);
    if (!parsed.success)
      throw new ApplicationError("RF_INVALID_INPUT", 400, "The invitation identifier is invalid.");
    await this.store.revokeInvitation(parsed.data);
  }
}
