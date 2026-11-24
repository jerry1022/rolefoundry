import { z } from "zod";
import type { Actor } from "../identity/core";
import { ApplicationError } from "../platform/errors";
import { refreshMatchSchema } from "./model";
import {
  reserveOptionalAnalysis,
  withOptionalAnalysis,
  type AnalysisReservations,
} from "../gateway/analysis";
import type { MatchingAuthorization, MatchingRepository } from "./ports";
function parse<T>(schema: z.ZodType<T>, value: unknown) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApplicationError("RF_INVALID_INPUT", 400, "Check the matching request and versions.");
  return result.data;
}
export class MatchingService {
  constructor(
    private readonly repository: MatchingRepository,
    private readonly auth: MatchingAuthorization,
    private readonly reservations?: AnalysisReservations,
  ) {}
  async refresh(actor: Actor, input: unknown, key: unknown) {
    await this.auth.authorize(actor, "matches:write", actor.userId);
    const request = parse(refreshMatchSchema, input);
    const idempotencyKey = parse(z.string().min(8).max(200), key);
    // Reserve before the run exists so its worker can never start without the reservation.
    const analysis = request.semantic
      ? await reserveOptionalAnalysis(this.reservations, actor, {
          feature: "matching",
          prefix: "matching",
          requestKey: idempotencyKey,
        })
      : ({ state: "not-requested", code: null, taskId: null } as const);
    const { analysis: semantic, ...task } = await withOptionalAnalysis(
      this.reservations,
      analysis,
      () => this.repository.refresh(request, idempotencyKey),
    );
    return { ...task, semantic };
  }
  async find(actor: Actor, id: unknown, cursor?: unknown) {
    await this.auth.authorize(actor, "matches:read", actor.userId);
    return this.repository.find(
      parse(z.uuid(), id),
      cursor === undefined ? undefined : parse(z.string().min(1).max(128), cursor),
    );
  }
  async list(actor: Actor, cursor?: unknown) {
    await this.auth.authorize(actor, "matches:read", actor.userId);
    return this.repository.list(
      cursor === undefined ? undefined : parse(z.string().min(1).max(128), cursor),
    );
  }
}
