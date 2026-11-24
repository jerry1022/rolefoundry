import { msg } from "../../lib/i18n";
import { translateStoredText, type StoredTemplate, type Translate } from "../ui/stored-text";

/**
 * Sentences that rules-v1 stores in matching reports (condition reasons, gap reasons and
 * limitations). `tests/unit/matching-text.test.ts` fails if the rules emit one missing here.
 */
export const fixedMatchingText = [
  msg(
    "Seniority fit has not been established. Skill overlap and self-reported years do not determine it.",
  ),
  msg("The listed workplace matches an explicit preference."),
  msg("The listed workplace is outside the selected preferences."),
  msg("Workplace or preference information is missing."),
  msg("Self-reported years meet the listed minimum; relevance still needs review."),
  msg("Self-reported years are below the listed minimum."),
  msg("Experience requirements or self-reported years are unknown."),
  msg("The owner reports meeting this exact listed requirement; it is not independently verified."),
  msg("The owner reports not meeting this listed requirement."),
  msg("No conclusion can be drawn from the available information."),
  msg(
    "This recipe uses rules only; semantic/model ranking and narrative generation are unavailable.",
  ),
  msg(
    "Order within equal rule results used semantic-rank-v1; strengths, gaps and conditions remain rule-based.",
  ),
  msg("A scored scenario suggests revisiting this skill; other claims remain separate."),
  msg("No supporting evidence is linked to this requirement. This does not prove inability."),
  msg("This textual requirement has no reviewed skill mapping; check it directly."),
  msg(
    "Coverage counts linked observations, self-reports and unreviewed references; it does not establish independent mastery or hiring probability.",
  ),
  msg("An unknown condition is not a conflict. Confirm it with the source before deciding."),
];

const templates: StoredTemplate[] = [
  {
    pattern: /^At least (\d+(?:\.\d+)?) years$/,
    message: msg("At least {years} years"),
    names: ["years"],
  },
];

export const matchingText = (text: string, t: Translate) => translateStoredText(text, t, templates);
