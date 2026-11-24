"use client";
import type { ProposalWording } from "@/modules/resume/model";
import { msg, useI18n } from "@/lib/i18n";

/** Why requested AI wording is not shown; the order proposal is unaffected. */
const fallbackReasons: Record<string, string> = {
  RF_GATEWAY_DISABLED: msg(
    "AI wording is not enabled on this deployment. Your allowance was returned.",
  ),
  RF_WORDING_NOT_NEEDED: msg(
    "No statement was long enough to reword. Your allowance was returned.",
  ),
  RF_CONSENT_REQUIRED: msg("Permission was withdrawn before AI wording ran."),
  RF_GATEWAY_INVALID_REFERENCE: msg("The suggestions changed facts or numbers, so none are shown."),
  default: msg("AI wording could not complete. The order proposal is still available."),
};

/**
 * AI wording never edits a confirmed version: each suggestion can be copied into the owner's
 * draft, reviewed there and confirmed as a new version.
 */
export function WordingSuggestions({
  wording,
  busy,
  onUse,
}: {
  wording: ProposalWording;
  busy: boolean;
  onUse: (factId: string, text: string) => void;
}) {
  const { t } = useI18n();
  if (wording.state === "not-requested") return null;
  return (
    <section className="section-block wording-suggestions">
      <h3>{t("AI wording suggestions")}</h3>
      {wording.state === "fallback" ? (
        <p className="notice warning" role="status">
          {t(fallbackReasons[wording.code ?? ""] ?? fallbackReasons.default)}
        </p>
      ) : wording.suggestions.length ? (
        <>
          <p className="muted">
            {t(
              "Each suggestion rewrites one confirmed statement without adding facts or numbers. Use one to edit your draft, check it, then confirm a new version.",
            )}
          </p>
          {wording.suggestions.map((item) => (
            <article className="wording-suggestion" key={item.factId}>
              <p>{item.text}</p>
              <small>{item.rationale}</small>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => onUse(item.factId, item.text)}
              >
                {t("Use in my draft")}
              </button>
            </article>
          ))}
        </>
      ) : (
        <p className="muted">
          {t("Your statements already read clearly; no rewording suggested.")}
        </p>
      )}
    </section>
  );
}
