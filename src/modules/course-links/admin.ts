import type { Actor } from "../identity/core";
import type { LearningAuthorization } from "../learning/ports";
import { linkQuerySchema, linkResumeSchema, type LinkAdminPage } from "./model";
import { ApplicationError } from "../platform/errors";
export interface CourseLinkAdministration {
  list(query: { cursor?: string; hostCursor?: string }): Promise<LinkAdminPage>;
  resume(input: { host: string; expectedRevision: number; reason: string }): Promise<void>;
}
export class CourseLinkAdminService {
  constructor(
    private readonly store: CourseLinkAdministration,
    private readonly auth: LearningAuthorization,
  ) {}
  async list(actor: Actor, input: unknown) {
    await this.auth.authorize(actor, "catalog:write");
    const query = linkQuerySchema.safeParse(input);
    if (!query.success)
      throw new ApplicationError("RF_INVALID_INPUT", 400, "The link-check query is invalid.");
    return this.store.list(query.data);
  }
  async resume(actor: Actor, input: unknown) {
    await this.auth.authorize(actor, "catalog:write");
    const parsed = linkResumeSchema.safeParse(input);
    if (!parsed.success)
      throw new ApplicationError(
        "RF_INVALID_INPUT",
        400,
        "The link-check recovery input is invalid.",
      );
    return this.store.resume(parsed.data);
  }
}
