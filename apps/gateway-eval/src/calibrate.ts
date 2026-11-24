import {
  reviewedCases,
  runShortAnswerCalibration,
  shortAnswerEnablementGate,
} from "../../../src/modules/assessment/short-answer";
import {
  reviewedShortAnswers,
  shortAnswerRubrics,
} from "../../../src/modules/assessment/short-answer-examples";
import { shortAnswerSpec } from "../../../src/modules/gateway/recipes";
import { evaluationGateway, interruptSignal, isLive } from "./gateway";

/**
 * Short-answer calibration against reviewer-labelled synthetic examples. The offline baseline
 * marks every criterion unmet, a floor that must fail the enablement gate; `--live` measures a
 * configured provider route. Exit code 1 means the gate did not pass.
 */
const gateway = evaluationGateway({
  purpose: "assessment.short-answer",
  maxOutputTokens: 1200,
  offline: (call) => {
    const payload = JSON.parse(call.messages[1].content) as {
      data: { ref: string; label: string }[];
    };
    const criteria = payload.data.filter((item) => item.label === "criterion");
    return {
      text: JSON.stringify({
        criteria: criteria.map((item) => ({ criterionRef: item.ref, met: false, quote: null })),
      }),
    };
  },
});
const { report, passes, results } = await runShortAnswerCalibration(
  (request, signal) => gateway.execute(request, shortAnswerSpec, signal),
  reviewedCases(shortAnswerRubrics, reviewedShortAnswers),
  interruptSignal(),
);
console.log(
  JSON.stringify(
    {
      mode: isLive() ? "live" : "offline-floor",
      gate: shortAnswerEnablementGate,
      passes,
      report,
      results,
    },
    null,
    2,
  ),
);
if (!passes) process.exitCode = 1;
