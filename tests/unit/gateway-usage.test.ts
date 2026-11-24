import { describe, expect, it, vi } from "vitest";
import {
  summarizeUsage,
  usageReportSchema,
  UsageReportService,
  type UsageReport,
} from "../../src/modules/gateway/usage";
import { createUsageClient } from "../../src/modules/gateway/adapters/http-client";
import { ApplicationError } from "../../src/modules/platform/errors";

const provider = (overrides: Partial<UsageReport["providers"][number]> = {}) => ({
  provider: "fake-a",
  model: "model-1",
  calls: 10,
  failures: 2,
  fallbacks: 1,
  repairs: 1,
  inputTokens: 1000,
  outputTokens: 200,
  costMicros: 1500,
  unpricedCalls: 0,
  p50LatencyMs: 800,
  p95LatencyMs: 2100,
  ...overrides,
});
const report = (providers = [provider()]): UsageReport => ({
  windowDays: 7,
  since: "2026-11-18T00:00:00.000Z",
  providers,
  purposes: [
    {
      purpose: "resume.wording",
      results: 8,
      succeeded: 6,
      rejected: 1,
      invalid: 1,
      providerFailed: 0,
      abandoned: 0,
      costMicros: 1500,
    },
  ],
  daily: [{ day: "2026-11-24", calls: 10, tokens: 1200, costMicros: 1500 }],
});

describe("AI usage report", () => {
  it("totals providers and flags spend as incomplete when calls had no estimate", () => {
    expect(summarizeUsage(report())).toEqual({
      calls: 10,
      failures: 2,
      tokens: 1200,
      costMicros: 1500,
      unpricedCalls: 0,
      failureRate: 0.2,
      spendComplete: true,
    });
    const partial = summarizeUsage(
      report([provider(), provider({ provider: "fake-b", unpricedCalls: 3, costMicros: 0 })]),
    );
    expect(partial).toMatchObject({ calls: 20, unpricedCalls: 3, spendComplete: false });
    expect(summarizeUsage(report([])).failureRate).toBeNull();
  });

  it("accepts only content-free rows and known purposes", () => {
    expect(usageReportSchema.parse(report())).toEqual(report());
    const withText = { ...report(), providers: [{ ...provider(), output: "learner text" }] };
    expect(usageReportSchema.safeParse(withText).success).toBe(false);
    const unknownPurpose = {
      ...report(),
      purposes: [{ ...report().purposes[0], purpose: "chat" }],
    };
    expect(usageReportSchema.safeParse(unknownPurpose).success).toBe(false);
  });

  it("defaults to seven days and rejects windows other than 1, 7 or 30 days", async () => {
    const store = { report: vi.fn(async () => report()) };
    const service = new UsageReportService(store);
    await service.report(undefined);
    await service.report("30");
    expect(store.report.mock.calls).toEqual([[7], [30]]);
    for (const value of ["2", "-1", "abc", 365])
      await expect(service.report(value)).rejects.toBeInstanceOf(ApplicationError);
  });

  it("requests the selected window and validates the response", async () => {
    const fetcher = vi.fn(async () => Response.json({ data: report() }));
    await expect(createUsageClient(fetcher as typeof fetch).report(30)).resolves.toEqual(report());
    expect(String((fetcher.mock.calls[0] as unknown[])[0])).toMatch(
      /\/api\/v1\/identity\/admin\/ai-usage\?days=30$/,
    );
  });
});
