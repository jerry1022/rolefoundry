import { z } from "zod";
import { ApplicationError } from "../platform/errors";
import type { SupabaseClient } from "@supabase/supabase-js";

export const featureSchema = z.enum(["assessment", "resume"]);
export type AnalysisFeature = z.infer<typeof featureSchema>;
export const actorSchema = z.object({ userId: z.uuid(), role: z.enum(["member", "admin"]) });
export type Actor = Readonly<z.infer<typeof actorSchema>>;
const verifiedActors = new WeakSet<object>();

const failures = {
  RF_UNAUTHORIZED: [401, "Sign in to continue."],
  RF_FORBIDDEN: [403, "This operation is not permitted."],
  RF_NOT_FOUND: [404, "The resource is unavailable."],
  RF_INVITATION_REQUIRED: [403, "A valid invitation is required."],
  RF_INVALID_INPUT: [400, "The request is invalid."],
  RF_CONSENT_VERSION: [409, "Review the current consent policy before continuing."],
  RF_CONSENT_REQUIRED: [403, "Current consent is required for this analysis."],
  RF_QUOTA_EXCEEDED: [429, "The weekly analysis limit has been reached."],
  RF_CONFLICT: [409, "The request conflicts with the current resource version or state."],
  RF_NOT_CONFIGURED: [503, "Identity is not configured for this deployment."],
  RF_UNAVAILABLE: [503, "Identity is temporarily unavailable."],
  RF_ORIGIN: [403, "The request origin is not permitted."],
  RF_TOO_LARGE: [413, "The request is too large."],
} as const;
export class IdentityError extends ApplicationError {
  constructor(readonly code: keyof typeof failures) {
    super(code, failures[code][0], failures[code][1]);
  }
}
export function databaseError(error: { message: string; code?: string }): IdentityError {
  const code = error.message as keyof typeof failures;
  if (Object.hasOwn(failures, code)) return new IdentityError(code);
  if (error.code === "42501") return new IdentityError("RF_FORBIDDEN");
  return new IdentityError("RF_UNAVAILABLE");
}
export async function resolveActor(client: SupabaseClient): Promise<Actor> {
  // getUser verifies with the Auth server. Cookie payloads and user_metadata are not roles.
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error && error.status && error.status >= 500) throw new IdentityError("RF_UNAVAILABLE");
  if (error || !user || !user.email_confirmed_at) throw new IdentityError("RF_UNAUTHORIZED");
  const { data, error: profileError } = await client.rpc("identity_current_actor");
  if (profileError) throw databaseError(profileError);
  const parsed = actorSchema.safeParse(data);
  if (!parsed.success || parsed.data.userId !== user.id) throw new IdentityError("RF_FORBIDDEN");
  const actor = Object.freeze(parsed.data);
  verifiedActors.add(actor);
  return actor;
}
const adminActions = new Set([
  "account:delete-recovery",
  "operations:read",
  "operations:replay",
  "admin:invitations",
  "admin:quotas",
  "admin:refunds",
  "catalog:write",
]);
const ownerActions = new Set([
  "account:delete",
  "account:export",
  "applications:read",
  "applications:write",
  "resume:read",
  "resume:write",
  "learning:read",
  "learning:write",
  "matches:read",
  "matches:write",
  "assessment:read",
  "assessment:write",
  "bookmark:read",
  "bookmark:write",
  "profile:read",
  "profile:write",
  "evidence:read",
  "evidence:write",
  "consent:read",
  "consent:write",
  "usage:read",
  "task:read",
  "task:create",
]);
export function assertAuthorized(
  actor: Actor | null,
  action: string,
  ownerId?: string,
): asserts actor is Actor {
  if (!actor || !verifiedActors.has(actor)) throw new IdentityError("RF_UNAUTHORIZED");
  if (adminActions.has(action)) {
    if (actor.role !== "admin") throw new IdentityError("RF_FORBIDDEN");
    return;
  }
  if (!ownerActions.has(action) || !ownerId) throw new IdentityError("RF_FORBIDDEN");
  if (ownerId !== actor.userId) throw new IdentityError("RF_NOT_FOUND");
}
export function utcWeekStart(date: Date): Date {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  result.setUTCDate(result.getUTCDate() - ((result.getUTCDay() + 6) % 7));
  return result;
}
export const policySchema = z.object({
  purpose: featureSchema,
  version: z.string(),
  description: z.string(),
});
export const consentSchema = z.object({
  id: z.uuid(),
  purpose: featureSchema,
  policyVersion: z.string(),
  grantedAt: z.string(),
});
export const usageSchema = z.object({
  feature: featureSchema,
  limit: z.number().int(),
  periodStart: z.string(),
  reserved: z.number().int(),
  consumed: z.number().int(),
});
export const taskResultSchema = z.object({
  taskId: z.uuid(),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
});
