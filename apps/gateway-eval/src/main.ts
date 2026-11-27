import { runWordingEvaluation } from "../../../src/modules/gateway/evaluation";
import { evaluationGateway, interruptSignal, isLive } from "./gateway";

/**
 * Fixed bilingual wording evaluation. Offline by default (deterministic echo baseline).
 * `--live` sends only the synthetic evaluation set and requires explicit confirmation.
 */
const gateway = evaluationGateway({
  purpose: "resume.wording",
  maxOutputTokens: 800,
  offline: (call) => {
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
  },
});
const report = await runWordingEvaluation(gateway, interruptSignal());
const sorted = [...report.latencyMs].sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      mode: isLive() ? "live" : "offline-baseline",
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
