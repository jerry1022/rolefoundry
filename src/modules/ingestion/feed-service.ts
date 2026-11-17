import { z } from "zod";
import type { Actor } from "../identity/core";
import { ApplicationError } from "../platform/errors";
import { feedConfigurationSchema } from "./model";
import type { FeedAdministrationStore, FeedRegistry, ImportAuthorization } from "./ports";
export class FeedAdministrationService {
  constructor(
    private readonly store: FeedAdministrationStore,
    private readonly registry: FeedRegistry,
    private readonly auth: ImportAuthorization,
  ) {}
  private parse<T>(schema: z.ZodType<T>, input: unknown): T {
    const result = schema.safeParse(input);
    if (!result.success)
      throw new ApplicationError(
        "RF_INVALID_INPUT",
        400,
        "Check the approved feed, source and schedule settings.",
      );
    return result.data;
  }
  async settings(actor: Actor) {
    await this.auth.authorize(actor, "catalog:write");
    return {
      settings: await this.store.feedSettings(),
      definitions: this.registry
        .list()
        .map(({ id, kind, format, revision }) => ({ id, kind, format, revision })),
    };
  }
  async configure(actor: Actor, id: unknown, input: unknown) {
    await this.auth.authorize(actor, "catalog:write");
    const sourceId = this.parse(z.uuid(), id),
      value = this.parse(feedConfigurationSchema, input),
      source = await this.store.source(sourceId),
      feed = this.registry.find(value.feedId, source.kind);
    if (!feed)
      throw new ApplicationError(
        "RF_INVALID_INPUT",
        400,
        "Select a deployment-approved feed for this source kind.",
      );
    return this.store.configureFeed(sourceId, value, feed.revision);
  }
  async request(actor: Actor, id: unknown, key: unknown) {
    await this.auth.authorize(actor, "catalog:write");
    const sourceId = this.parse(z.uuid(), id),
      requestKey = this.parse(z.string().min(8).max(120), key),
      setting = (await this.store.feedSettings()).find((item) => item.sourceId === sourceId);
    if (
      !setting ||
      !setting.feedId ||
      this.registry.find(setting.feedId, setting.kind)?.revision !== setting.feedRevision
    )
      throw new ApplicationError(
        "RF_CONFLICT",
        409,
        "Review the current deployment-approved feed configuration before fetching.",
      );
    return this.store.requestFeed(sourceId, requestKey);
  }
  async find(actor: Actor, id: unknown) {
    await this.auth.authorize(actor, "catalog:write");
    return this.store.feedRun(this.parse(z.uuid(), id));
  }
  async list(actor: Actor) {
    await this.auth.authorize(actor, "catalog:write");
    return this.store.feedRuns();
  }
}
