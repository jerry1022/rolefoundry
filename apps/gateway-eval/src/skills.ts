import {
  extractionEnablementGate,
  runExtractionCalibration,
} from "../../../src/modules/resume/skill-extraction";
import {
  extractionSkills,
  reviewedResumes,
} from "../../../src/modules/resume/skill-extraction-examples";
import { skillExtractionSpec } from "../../../src/modules/gateway/recipes";
import { evaluationGateway, interruptSignal, isLive } from "./gateway";

/**
 * Skill-extraction calibration against reviewer-labelled synthetic resume facts. The offline
 * baseline tags a skill whenever its name appears in the fact, a keyword matcher that tool lists
 * and keyword stuffing defeat; `--live` measures a configured provider route. Exit code 1 means
 * the enablement gate did not pass.
 */
const gateway = evaluationGateway({
  purpose: "resume.skill-extraction",
  maxOutputTokens: 1500,
  offline: (call) => {
    const payload = JSON.parse(call.messages[1].content) as {
      data: { ref: string; label: string; text: string }[];
    };
    const skills = payload.data.filter((item) => item.label === "skill");
    const facts = payload.data.filter((item) => item.label === "fact");
    return {
      text: JSON.stringify({
        facts: facts.map((fact) => ({
          factRef: fact.ref,
          skills: skills.flatMap((skill) => {
            const name = skill.text
              .split(" / ")
              .find((value) => fact.text.toLowerCase().includes(value.toLowerCase()));
            return name ? [{ skillRef: skill.ref, quote: name }] : [];
          }),
        })),
      }),
    };
  },
});
const { report, passes, results } = await runExtractionCalibration(
  (request, signal) => gateway.execute(request, skillExtractionSpec, signal),
  reviewedResumes,
  extractionSkills,
  interruptSignal(),
);
console.log(
  JSON.stringify(
    {
      mode: isLive() ? "live" : "offline-keyword-baseline",
      gate: extractionEnablementGate,
      passes,
      report,
      results,
    },
    null,
    2,
  ),
);
if (!passes) process.exitCode = 1;
