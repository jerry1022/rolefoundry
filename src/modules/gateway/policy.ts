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
  /**
   * Deployment-supplied list prices (USD per million tokens) for spend estimates. Prices are
   * never hard-coded; without them cost stays unknown rather than guessed.
   */
  pricing: z
    .object({
      inputPerMillionUsd: z.number().min(0).max(1000),
      outputPerMillionUsd: z.number().min(0).max(1000),
    })
    .strict()
    .optional(),
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
    /** Optional provider-wide concurrency across all worker instances and purposes. */
    providerLimits: z
      .record(
        adapterId,
        z
          .object({
            concurrency: z.number().int().min(1).max(64).optional(),
            /** Rolling 24-hour token cap (estimated before the call, settled after). */
            dailyTokens: z.number().int().min(1).max(1_000_000_000).optional(),
          })
          .strict()
          .refine((limit) => limit.concurrency || limit.dailyTokens, {
            message: "A provider limit needs concurrency or dailyTokens.",
          }),
      )
      .optional(),
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
