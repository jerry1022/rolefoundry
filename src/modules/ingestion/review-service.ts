import { z } from "zod";
import type { Actor } from "../identity/core";
import { ApplicationError } from "../platform/errors";
import { jobDraftSchema } from "../jobs/model";
import { courseDraftSchema } from "../learning/model";
import { planImport, type ImportKeyFactory } from "./normalizer";
import type { ImportReviewStore, ImportAuthorization } from "./ports";
export class ImportReviewService {
  constructor(
    private readonly store: ImportReviewStore,
    private readonly auth: ImportAuthorization,
    private readonly keys: ImportKeyFactory,
  ) {}
  private parse<T>(schema: z.ZodType<T>, input: unknown): T {
    const parsed = schema.safeParse(input);
    if (!parsed.success)
      throw new ApplicationError(
        "RF_INVALID_INPUT",
        400,
        "Check the review fields, target choice and expected revision.",
      );
    return parsed.data;
  }
  async find(actor: Actor, id: unknown) {
    await this.auth.authorize(actor, "catalog:write");
    return this.store.review(this.parse(z.uuid(), id));
  }
  async rebase(actor: Actor, id: unknown, input: unknown) {
    await this.auth.authorize(actor, "catalog:write");
    const reviewId = this.parse(z.uuid(), id),
      value = this.parse(
        z
          .object({ expectedRevision: z.number().int().positive(), targetId: z.uuid().nullable() })
          .strict(),
        input,
      ),
      prepared = await this.store.prepareReview(reviewId, value.expectedRevision, value.targetId);
    const normalized = planImport(prepared.content, prepared.context, this.keys).rows[0];
    if (!normalized)
      throw new ApplicationError("RF_CONFLICT", 409, "The source row cannot be rebased.");
    normalized.position = prepared.position;
    return this.store.rebase(
      reviewId,
      value.expectedRevision,
      value.targetId,
      prepared.context.source.fingerprint,
      prepared.context.dictionary.version,
      normalized,
    );
  }
  async decide(actor: Actor, id: unknown, input: unknown, key: unknown) {
    await this.auth.authorize(actor, "catalog:write");
    const reviewId = this.parse(z.uuid(), id),
      value = this.parse(
        z
          .object({
            expectedRevision: z.number().int().positive(),
            decision: z.enum(["publish", "reject", "close", "confirm"]),
            draft: z.record(z.string(), z.unknown()).nullable(),
            reason: z.string().trim().min(1).max(1000),
            allowNewDuplicate: z.boolean(),
          })
          .strict(),
        input,
      ),
      requestKey = this.parse(z.string().min(8).max(200), key);
    const review = await this.store.review(reviewId);
    let draft: Record<string, unknown> | null = null;
    if (value.decision === "publish") {
      draft =
        review.kind === "jobs"
          ? this.parse(jobDraftSchema, value.draft)
          : this.parse(courseDraftSchema, value.draft);
    } else if (value.draft !== null)
      throw new ApplicationError(
        "RF_INVALID_INPUT",
        400,
        "This decision does not accept replacement metadata.",
      );
    return this.store.decide(
      reviewId,
      value.expectedRevision,
      value.decision,
      draft,
      value.reason,
      value.allowNewDuplicate,
      requestKey,
    );
  }
}
