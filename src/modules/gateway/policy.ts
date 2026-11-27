import { z } from "zod";
import { gatewayPurposes, type GatewayPurpose } from "./model";

const adapterId = z.string().regex(/^[a-z][a-z0-9-]{1,30}$/);
const targetShape = {
  adapter: adapterId,
  model: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[A-Za-z0-9._:/-]+$/),
  /**
   * Every party that receives the minimized input on this route (the adapter's
   * provider plus any reviewed upstream). Consent must cover all of them.
   */
  recipients: z.array(adapterId).min(1).max(8),
};
const ownRecipient = {
  message: "A route's recipients must include its own provider.",
};
const target = z
  .object(targetShape)
  .strict()
  .refine((value) => value.recipients.includes(value.adapter), ownRecipient);
const fallbackTarget = z
  .object({ ...targetShape, enabled: z.boolean() })
  .strict()
  .refine((value) => value.recipients.includes(value.adapter), ownRecipient);
export type RouteTarget = z.infer<typeof target>;

const route = z
  .object({
    primary: target,
    /** Disabled until the route and its data use are reviewed; never implicit. */
    fallback: fallbackTarget.optional(),
    deadlineMs: z.number().int().min(1000).max(120000),
    /** Total primary calls (first try plus transient retries). */
    primaryAttempts: z.number().int().min(1).max(3),
    maxInputChars: z.number().int().min(200).max(60000),
    maxOutputTokens: z.number().int().min(16).max(8000),
    concurrency: z.number().int().min(1).max(16),
  })
  .strict()
  .refine((value) => !value.fallback || value.fallback.adapter !== value.primary.adapter, {
    message: "A fallback must use a different provider adapter.",
  });
export type GatewayRoute = z.infer<typeof route>;

export const gatewayPolicySchema = z
  .object({
    routes: z.partialRecord(z.enum(gatewayPurposes), route),
  })
  .strict();
export type GatewayPolicy = z.infer<typeof gatewayPolicySchema>;

/** Deployment JSON; malformed policy fails closed without echoing configuration. */
export function parseGatewayPolicy(raw: string | undefined): GatewayPolicy {
  if (!raw?.trim()) return { routes: {} };
  if (new TextEncoder().encode(raw).length > 32768)
    throw new Error("AI gateway policy is invalid.");
  try {
    return gatewayPolicySchema.parse(JSON.parse(raw));
  } catch {
    throw new Error("AI gateway policy is invalid.");
  }
}

/** Recipients the owner's consent must cover before any request is sent on this route. */
export function routeRecipients(route: GatewayRoute) {
  const all = new Set(route.primary.recipients);
  if (route.fallback?.enabled) for (const value of route.fallback.recipients) all.add(value);
  return [...all].sort();
}

export function purposeRoute(policy: GatewayPolicy, purpose: GatewayPurpose) {
  return policy.routes[purpose] ?? null;
}
