import { z } from "zod";
import type { Actor } from "../identity/core";
import { ApplicationError } from "../platform/errors";
import { refreshMatchSchema } from "./model";
import type { AnalysisReservations, MatchingAuthorization, MatchingRepository } from "./ports";
function parse<T>(schema: z.ZodType<T>, value: unknown) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApplicationError("RF_INVALID_INPUT", 400, "Check the matching request and versions.");
  return result.data;
}
/** `matching:` + key must fit the identity idempotency limit (200). */
const semanticKeyLimit = 191;

/** Stable UUID-shaped reference so a retried request reuses the same reservation. */
async function deterministicId(seed: string) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed)),
  );
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = [...digest.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
    const reservation = request.semantic
      ? await this.reserve(actor, idempotencyKey)
      : { state: "not-requested" as const, code: null, taskId: null };
    try {
      const task = await this.repository.refresh(request, idempotencyKey);
      return { ...task, semantic: { state: reservation.state, code: reservation.code } };
    } catch (error) {
      if (reservation.taskId)
        await this.reservations?.releaseAnalysis(reservation.taskId).catch(() => undefined);
      throw error;
    }
  }

  /** Missing consent or allowance never blocks the rules-based report. */
  private async reserve(actor: Actor, key: string) {
    if (!this.reservations || key.length > semanticKeyLimit)
      return { state: "unavailable" as const, code: "RF_NOT_CONFIGURED", taskId: null };
    try {
      const { taskId } = await this.reservations.reserveAnalysis(actor, {
        feature: "matching",
        resourceId: await deterministicId(`${actor.userId}:${key}`),
        inputVersion: `matching-key:${key}`,
        idempotencyKey: `matching:${key}`,
      });
      return { state: "reserved" as const, code: null, taskId };
    } catch (error) {
      const code = error instanceof ApplicationError ? error.code : "RF_UNAVAILABLE";
      return { state: "unavailable" as const, code, taskId: null };
    }
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
