import { msg } from "../../lib/i18n";
import { translateStoredText, type StoredTemplate, type Translate } from "../ui/stored-text";

/**
 * Plans store the planner's English sentences (issues, notes and generated practice text), so a
 * persisted plan reads the same everywhere. This maps them to translated UI messages at render
 * time. Fixed sentences are listed as `msg()` markers so `npm run i18n:check` requires their zh-TW
 * text; `tests/unit/planner-text.test.ts` fails if the planner emits a sentence missing here.
 */
export const fixedPlannerText = [
  msg("The initial plan reached its 40-step review limit. Remaining work needs a later plan."),
  msg(
    "A required foundation is missing, unavailable, cyclic or cannot finish inside this two-week budget.",
  ),
  msg(
    "No reviewed duration or owner estimate is available. Adjust the estimate before scheduling this resource.",
  ),
  msg("This resource needs a later stage because the two-week time budget is already allocated."),
  msg("Course and step completion are self-reported progress, not verified ability."),
  msg("Only a portion fits in two weeks; later work remains explicit."),
  msg("This duration is an estimate; review and adjust it to your pace."),
  msg(
    "Prerequisite skill support may be self-reported or scoped; confirm it before relying on it.",
  ),
  msg(
    "A related course is already reported complete. Build or assess evidence instead of repeating it automatically.",
  ),
  msg("No reviewed, available resource covers this gap. This provider may not cover the domain."),
  msg(
    "Keep a reference and a short explanation, then request assessment or independent review. No ability is promoted automatically.",
  ),
  msg("This is an original editorial practice prompt, not a provider course or graded evidence."),
  msg("The initial plan reached its 40-step review limit. Remaining gaps need a later plan."),
  msg("No weekly time is allocated. Choose a positive time budget to schedule learning."),
  msg(
    "This is an initial two-week plan, not a promise of course completion or professional proficiency.",
  ),
  msg(
    "Resource facts belong to the provider; summaries, mappings, estimates and practice prompts are editorial.",
  ),
  msg("Completing a course or submitting a reference never changes capability evidence."),
];

const templates: StoredTemplate[] = [
  {
    pattern:
      /^Complete the assigned (\d+) study minutes, keep notes and continue the remaining work in a later plan\. This step does not mean course completion\.$/,
    message: msg(
      "Complete the assigned {minutes} study minutes, keep notes and continue the remaining work in a later plan. This step does not mean course completion.",
    ),
    names: ["minutes"],
  },
  { pattern: /^Practice (.+)$/, message: msg("Practice {skill}"), names: ["skill"] },
  {
    pattern: /^Create a small example demonstrating (.+); describe its limits and one test\.$/,
    message: msg("Create a small example demonstrating {skill}; describe its limits and one test."),
    names: ["skill"],
  },
];

/** Translated text for a stored planner sentence; course titles pass through. */
export const plannerText = (text: string, t: Translate) => translateStoredText(text, t, templates);
