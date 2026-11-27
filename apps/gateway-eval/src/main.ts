import { AIGateway } from "../../../src/modules/gateway/service";
import { FakeAdapter } from "../../../src/modules/gateway/adapters/fake";
import { adaptersFromEnvironment } from "../../../src/modules/gateway/adapters/registry";
import { parseGatewayPolicy } from "../../../src/modules/gateway/policy";
import { gatewayTemplates } from "../../../src/modules/gateway/recipes";
import { runWordingEvaluation } from "../../../src/modules/gateway/evaluation";
import type { GatewayAuthority } from "../../../src/modules/gateway/ports";

/**
 * Fixed bilingual wording evaluation. Offline by default (deterministic echo baseline).
 * `--live` sends only the synthetic evaluation set and requires explicit confirmation.
 */
const live = process.argv.includes("--live");
const syntheticOnly: GatewayAuthority = {
  admit: async () => ({ admitted: true }),
  stillCurrent: async () => true,
};
let gateway: AIGateway;
if (live) {
  if (process.env.ROLEFOUNDRY_AI_EVAL_CONFIRM !== "synthetic-only")
    throw new Error("Set ROLEFOUNDRY_AI_EVAL_CONFIRM=synthetic-only to send the synthetic set.");
  const policy = parseGatewayPolicy(process.env.ROLEFOUNDRY_AI_POLICY);
  if (!policy.routes["resume.wording"])
    throw new Error("ROLEFOUNDRY_AI_POLICY has no resume.wording route.");
  gateway = new AIGateway(
    policy,
    adaptersFromEnvironment(process.env),
    gatewayTemplates,
    syntheticOnly,
  );
} else {
  const echo = new FakeAdapter("offline", (call) => {
    const payload = JSON.parse(call.messages[1].content) as {
      locale: string;
      data: { ref: string; text: string }[];
    };
    return {
      text: JSON.stringify({
        suggestions: payload.data.map((item) => ({
          factRef: item.ref,
          text: item.text,
          rationale:
            payload.locale === "zh-TW" ? "離線基準：原文。" : "Offline baseline: unchanged.",
        })),
      }),
    };
  });
  gateway = new AIGateway(
    parseGatewayPolicy(
      JSON.stringify({
        routes: {
          "resume.wording": {
            primary: { adapter: "offline", model: "echo-baseline", recipients: ["offline"] },
            deadlineMs: 5000,
            primaryAttempts: 1,
            maxInputChars: 8000,
            maxOutputTokens: 800,
            concurrency: 1,
          },
        },
      }),
    ),
    [echo],
    gatewayTemplates,
    syntheticOnly,
  );
}
const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => controller.abort());
const report = await runWordingEvaluation(gateway, controller.signal);
const sorted = [...report.latencyMs].sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      mode: live ? "live" : "offline-baseline",
      cases: report.cases,
      succeeded: report.succeeded,
      invalidOutput: report.invalidOutput,
      invalidReference: report.invalidReference,
      providerFailed: report.providerFailed,
      zhTwLocaleMatch: `${report.localeMatches}/${report.localeTotal}`,
      p50LatencyMs: sorted[Math.floor(sorted.length / 2)] ?? null,
      maxLatencyMs: sorted.at(-1) ?? null,
      usage: report.usage,
      results: report.results,
    },
    null,
    2,
  ),
);
if (report.succeeded !== report.cases) process.exitCode = 1;
