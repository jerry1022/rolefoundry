import { z } from "zod";
import { ApplicationError } from "../platform/errors";
import { gatewayPurposes } from "./model";

/**
 * Administrator AI usage built from content-free gateway records: counts, tokens, latency and
 * estimated spend only. Spend is an estimate from deployment-configured pricing, not an invoice.
 */
export const usageWindows = [1, 7, 30] as const;
export type UsageWindow = (typeof usageWindows)[number];
export const usageWindowSchema = z.coerce
  .number()
  .refine((value): value is UsageWindow => (usageWindows as readonly number[]).includes(value));

const count = z.number().int().nonnegative();
const provider = z.string().regex(/^[a-z][a-z0-9-]{1,30}$/);

export const usageReportSchema = z
  .object({
    windowDays: usageWindowSchema,
    since: z.iso.datetime({ offset: true }),
    providers: z
      .array(
        z
          .object({
            provider,
            model: z.string().min(1).max(120),
            calls: count,
            failures: count,
            fallbacks: count,
            repairs: count,
            inputTokens: count,
            outputTokens: count,
            costMicros: count,
            unpricedCalls: count,
            p50LatencyMs: count,
            p95LatencyMs: count,
          })
          .strict(),
      )
      .max(32),
    purposes: z
      .array(
        z
          .object({
            purpose: z.enum(gatewayPurposes),
            results: count,
            succeeded: count,
            rejected: count,
            invalid: count,
            providerFailed: count,
            abandoned: count,
            costMicros: count,
          })
          .strict(),
      )
      .max(gatewayPurposes.length),
    daily: z
      .array(
        z
          .object({
            day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            calls: count,
            tokens: count,
            costMicros: count,
          })
          .strict(),
      )
      .max(31),
  })
  .strict();
export type UsageReport = z.infer<typeof usageReportSchema>;

/**
 * Window totals. Calls, tokens and spend come from the daily series, which is complete; the
 * provider table is capped at 32 rows. Failures and unpriced calls exist only per provider, so
 * the failure rate uses the provider rows' own call count. `spendComplete` is false when any
 * successful call had no estimate.
 */
export function summarizeUsage(report: UsageReport) {
  const daily = report.daily.reduce(
    (sum, day) => ({
      calls: sum.calls + day.calls,
      tokens: sum.tokens + day.tokens,
      costMicros: sum.costMicros + day.costMicros,
    }),
    { calls: 0, tokens: 0, costMicros: 0 },
  );
  const providers = report.providers.reduce(
    (sum, row) => ({
      calls: sum.calls + row.calls,
      failures: sum.failures + row.failures,
      unpricedCalls: sum.unpricedCalls + row.unpricedCalls,
    }),
    { calls: 0, failures: 0, unpricedCalls: 0 },
  );
  return {
    ...daily,
    failures: providers.failures,
    unpricedCalls: providers.unpricedCalls,
    failureRate: providers.calls ? providers.failures / providers.calls : null,
    spendComplete: providers.unpricedCalls === 0,
  };
}

export interface UsageReportStore {
  report(windowDays: UsageWindow): Promise<UsageReport>;
}

/** Validates the window; the database re-verifies the administrator. */
export class UsageReportService {
  constructor(private readonly store: UsageReportStore) {}
  async report(windowDays: unknown) {
    const parsed = usageWindowSchema.safeParse(windowDays ?? 7);
    if (!parsed.success)
      throw new ApplicationError("RF_INVALID_INPUT", 400, "The usage window is invalid.");
    return this.store.report(parsed.data);
  }
}
