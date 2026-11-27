import { z } from "zod";
import type { Actor } from "../identity/core";
import { ApplicationError } from "../platform/errors";
import type { OperationsAuthorization } from "./ports";
export const replayReasonSchema = z.enum([
  "configuration-restored",
  "storage-restored",
  "directory-restored",
  "operator-reviewed",
]);
export const replayInputSchema = z
  .object({ requestId: z.uuid(), reason: replayReasonSchema })
  .strict();
export const replayPreviewSchema = z.object({
  available: z.boolean(),
  reason: z
    .enum([
      "already-replayed",
      "not-terminal",
      "permanent",
      "owner-unavailable",
      "source-stale",
      "limit",
      "deployment-unavailable",
    ])
    .nullable(),
  nextTaskId: z.uuid().nullable(),
});
export const replayContextSchema = replayPreviewSchema.extend({
  feed: z
    .object({
      id: z.string(),
      revision: z.string().regex(/^[a-f0-9]{64}$/),
      kind: z.enum(["jobs", "courses"]),
    })
    .nullable(),
});
export const replayResultSchema = z.object({ previousTaskId: z.uuid(), taskId: z.uuid() });
export type ReplayInput = z.infer<typeof replayInputSchema>;
export type ReplayPreview = z.infer<typeof replayPreviewSchema>;
export type ReplayContext = z.infer<typeof replayContextSchema>;
export type ReplayResult = z.infer<typeof replayResultSchema>;
export interface TaskReplayStore {
  context(taskId: string): Promise<ReplayContext>;
  request(taskId: string, input: ReplayInput): Promise<ReplayResult>;
}
export interface ReplayFeedPolicy {
  allows(feed: NonNullable<ReplayContext["feed"]>): boolean;
}
export interface TaskReplayClient {
  preview(taskId: string): Promise<ReplayPreview>;
  request(taskId: string, input: ReplayInput): Promise<ReplayResult>;
}
/** A mutation port independent of metadata reads; the database repeats domain checks atomically. */
export class TaskReplayService {
  constructor(
    private readonly store: TaskReplayStore,
    private readonly auth: OperationsAuthorization,
    private readonly feeds: ReplayFeedPolicy,
  ) {}
  private id(value: unknown) {
    const result = z.uuid().safeParse(value);
    if (!result.success)
      throw new ApplicationError("RF_INVALID_INPUT", 400, "The task identifier is invalid.");
    return result.data;
  }
  private previewOf(context: ReplayContext): ReplayPreview {
    const allowed = !context.feed || this.feeds.allows(context.feed);
    return replayPreviewSchema.parse({
      ...context,
      ...(!allowed ? { available: false, reason: "deployment-unavailable" } : {}),
    });
  }
  async preview(actor: Actor, value: unknown) {
    await this.auth.authorize(actor, "operations:replay");
    return this.previewOf(await this.store.context(this.id(value)));
  }
  async request(actor: Actor, value: unknown, input: unknown) {
    await this.auth.authorize(actor, "operations:replay");
    const id = this.id(value),
      parsed = replayInputSchema.safeParse(input);
    if (!parsed.success)
      throw new ApplicationError(
        "RF_INVALID_INPUT",
        400,
        "Choose a recovery reason and a valid request identifier.",
      );
    const context = await this.store.context(id);
    // A repeated accepted request may already have rebound the source; let the atomic coordinator
    // recover that same receipt. It never creates a second child for another request identifier.
    if (context.feed && !this.feeds.allows(context.feed))
      throw new ApplicationError(
        "RF_CONFLICT",
        409,
        "The deployment no longer approves this feed definition.",
      );
    if (!context.available && context.reason !== "already-replayed")
      throw new ApplicationError(
        "RF_CONFLICT",
        409,
        "The original request is no longer eligible for recovery.",
      );
    return this.store.request(id, parsed.data);
  }
}
