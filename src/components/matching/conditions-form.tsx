"use client";
import { useState } from "react";
import Link from "next/link";
import type { PublishedJob } from "@/modules/jobs/model";
import type { MatchConstraints } from "@/modules/matching/model";
import { useI18n } from "@/lib/i18n";
export function MatchingConditionsForm({
  target,
  workplaces,
  busy,
  onSubmit,
}: {
  target: PublishedJob | null;
  workplaces: string[];
  busy: boolean;
  onSubmit: (constraints: MatchConstraints) => void;
}) {
  const { t } = useI18n();
  const [years, setYears] = useState(""),
    [answers, setAnswers] = useState<Record<string, "confirmed" | "conflict" | "unknown">>({});
  return (
    <form
      className="panel section-block"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          experienceYears: years === "" ? null : Number(years),
          confirmations: target
            ? (["workAuthorization", "education"] as const)
                .filter((field) => target.conditions[field])
                .map((field) => ({
                  jobVersionId: target.versionId,
                  field,
                  answer: answers[field] || "unknown",
                }))
            : [],
        });
      }}
    >
      <h2>{t("Conditions for a new report")}</h2>
      <p className="muted">
        {t("Changes here apply to the next report. Existing reports keep their saved inputs.")}
      </p>
      <p className="muted">
        {t("Workplace preferences: {workplaces}.", {
          workplaces: workplaces.length
            ? workplaces.map((workplace) => t(workplace)).join(", ")
            : t("Not specified"),
        })}{" "}
        <Link href="/skills/">{t("Edit my profile")}</Link>.
      </p>
      <fieldset className="profile-form-fields" disabled={busy}>
        <label>
          {t("Self-reported relevant experience (years, optional)")}
          <input
            aria-label={t("Relevant experience years")}
            className="text-input"
            type="number"
            min={0}
            max={80}
            step="any"
            value={years}
            onChange={(event) => setYears(event.target.value)}
          />
        </label>
        <p className="muted">
          {t(
            "Leaving a field unknown does not count as a conflict. Years alone do not verify relevant experience.",
          )}
        </p>
        {target &&
          (["workAuthorization", "education"] as const).map(
            (field) =>
              target.conditions[field] && (
                <label key={field}>
                  {field === "education" ? t("Education") : t("Work authorization")}:{" "}
                  {target.conditions[field]}
                  <select
                    className="text-input"
                    aria-label={
                      field === "education"
                        ? t("education confirmation")
                        : t("workAuthorization confirmation")
                    }
                    value={answers[field] || "unknown"}
                    onChange={(event) =>
                      setAnswers({
                        ...answers,
                        [field]: event.target.value as "confirmed" | "conflict" | "unknown",
                      })
                    }
                  >
                    <option value="unknown">{t("I am not sure")}</option>
                    <option value="confirmed">{t("I report meeting this requirement")}</option>
                    <option value="conflict">{t("I report not meeting this requirement")}</option>
                  </select>
                </label>
              ),
          )}
        {!target && (
          <p className="muted">
            {t(
              "Education and work authorization stay unknown in a direction-wide report. Choose one role to confirm its exact listed conditions.",
            )}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          {busy ? t("Creating report…") : t("Create a fresh matching report")}
        </button>
      </fieldset>
      <p className="fine-print">
        {t(
          "This rule-based analysis uses no external AI provider or AI allowance. It helps you explore opportunities; it does not decide employment eligibility.",
        )}
      </p>
    </form>
  );
}
