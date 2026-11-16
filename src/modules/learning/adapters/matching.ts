import { rankMatches } from "../../matching/rules";
import type { LearningGapAnalyzer } from "../ports";
/** Replace this adapter when an evaluated matching recipe replaces the rule-only fallback. */
export class RuleLearningGapAnalyzer implements LearningGapAnalyzer {
  analyze(input: Parameters<LearningGapAnalyzer["analyze"]>[0]) {
    const result = rankMatches(input)[0];
    return {
      recipe: "rules-v1" as const,
      gaps: result?.gaps || [],
      supportedSkills: [
        ...new Set(
          input.evidence
            .filter((evidence) => ["support", "claim", "reference"].includes(evidence.signal))
            .flatMap((evidence) => evidence.skills),
        ),
      ],
    };
  }
}
