import { msg } from "../../lib/i18n";
import { translateStoredText, type Translate } from "../ui/stored-text";

/**
 * Sentences that resume-order-v1 stores in proposals (change reasons, evidence questions and
 * limitations). `tests/unit/resume-text.test.ts` fails if the rules emit one missing here.
 */
export const fixedResumeText = [
  msg(
    "Place confirmed statements linked to the target's skills earlier in this section. Their wording and completion state are unchanged.",
  ),
  msg(
    "Do you have a real example for this requirement? Add it as a separately confirmed fact if appropriate; the requirement is not added as a claim.",
  ),
  msg(
    "This deterministic fallback reorders existing confirmed statements only; it does not rewrite, measure ATS fit or certify ability.",
  ),
  msg(
    "Linked skills are owner-confirmed labels. Target requirements are not proof of personal experience.",
  ),
  msg("Model-assisted wording requires the separately evaluated AI Gateway integration."),
];

export const resumeText = (text: string, t: Translate) => translateStoredText(text, t);
