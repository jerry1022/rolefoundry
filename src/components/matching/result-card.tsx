"use client";
import Link from "next/link";
import type { MatchRun } from "@/modules/matching/model";
import { skillLabel } from "@/modules/skills/model";
import { matchingText } from "./matching-text";
import { msg, useI18n } from "@/lib/i18n";
type Result = MatchRun["data"][number];
const actions = {
  "explore-now": msg("Explore this opportunity"),
  "strengthen-evidence": msg("Strengthen the supporting evidence"),
  "longer-term-target": msg("Consider a longer-term target"),
  "condition-conflict": msg("Review an explicit condition conflict"),
};
const conditionFields: Record<Result["conditions"][number]["field"], string> = {
  experienceYears: msg("Experience"),
  workAuthorization: msg("Work authorization"),
  education: msg("Education"),
  seniority: msg("Seniority"),
  workplace: msg("Workplace"),
};
const conditionStatuses: Record<Result["conditions"][number]["status"], string> = {
  confirmed: msg("confirmed"),
  conflict: msg("conflict"),
  unknown: msg("unknown"),
};
export function MatchingResultCard({
  result,
  historical,
  labels,
}: {
  result: Result;
  historical: boolean;
  labels: Record<string, string>;
}) {
  const { t } = useI18n();
  return (
    <article className="panel matching-result">
      <p className="mini-label">{result.company}</p>
      <h3>{result.title}</h3>
      <p className="pill">
        {!result.available
          ? t("Historical role · no longer available")
          : historical
            ? t("Historical report · refresh before using")
            : t(actions[result.action])}
      </p>
      <p>
        {t("Mandatory skills with linked support:")}{" "}
        <strong>
          {result.coverage.mandatory.covered} / {result.coverage.mandatory.total}
        </strong>
        . {t("Preferred:")}{" "}
        <strong>
          {result.coverage.preferred.covered} / {result.coverage.preferred.total}
        </strong>
        .
      </p>
      <p className="muted">
        {t(
          "Support may be self-reported or an unreviewed reference. These counts are not hiring probabilities or verified competency levels.",
        )}
      </p>
      {result.freshness === "uncertain" && (
        <p className="notice">
          {t(
            "The source could not recently confirm availability. Check the original role before planning an application.",
          )}
        </p>
      )}
      <h4>{t("Conditions")}</h4>
      <ul className="matching-conditions">
        {result.conditions.map((condition) => (
          <li key={condition.field}>
            <span className="pill">{t(conditionStatuses[condition.status])}</span>{" "}
            <strong>{t(conditionFields[condition.field])}</strong>:{" "}
            {condition.requirement ? matchingText(condition.requirement, t) : t("Not supplied")}
            <p className="muted">{matchingText(condition.reason, t)}</p>
          </li>
        ))}
      </ul>
      <h4>{t("Requirements and their supporting sources")}</h4>
      {result.requirements.map((requirement) => (
        <section className="matching-requirement" key={requirement.ordinal}>
          <p>
            <strong>
              {requirement.priority === "mandatory" ? t("Mandatory") : t("Preferred")}
            </strong>{" "}
            · {requirement.text}
          </p>
          {!requirement.skills.length && (
            <p className="muted">
              {t("This text has no reviewed skill mapping. Check it directly.")}
            </p>
          )}
          {requirement.skills.map((skill) => (
            <div key={skill.skillId}>
              <strong>{skillLabel(skill.skillId, labels)}</strong>
              {!skill.support.length && (
                <p className="muted">{t("No linked support. This does not prove inability.")}</p>
              )}
              {[...skill.support, ...skill.practice].map((reference) => (
                <details key={reference.versionId} className="matching-reference">
                  <summary>
                    {reference.label} · {reference.source} ·{" "}
                    {reference.signal === "practice"
                      ? t("needs practice")
                      : reference.signal === "support"
                        ? t("observed in one scenario")
                        : t("unverified")}
                  </summary>
                  <p>{reference.context || t("No additional context supplied.")}</p>
                  <Link href="/skills/">{t("Review this evidence in my profile")}</Link>
                </details>
              ))}
            </div>
          ))}
        </section>
      ))}
      {result.available && (
        <Link className="button secondary" href={`/learning/?job=${result.jobId}`}>
          {t("Plan learning for this role")}
        </Link>
      )}
      {result.available && (
        <Link className="button secondary" href={`/resume/?job=${result.jobId}`}>
          {t("Review resume for this role")}
        </Link>
      )}
      <h4>{t("Useful next actions")}</h4>
      {result.available && (
        <Link className="button secondary" href={`/applications/?job=${result.jobId}`}>
          {t("Prepare a tracking record")}
        </Link>
      )}
      <ul>
        {result.gaps.length ? (
          result.gaps.map((gap, index) => (
            <li key={index}>
              {gap.skillId
                ? t("{skill}: {reason}", {
                    skill: skillLabel(gap.skillId, labels),
                    reason: matchingText(gap.reason, t),
                  })
                : matchingText(gap.reason, t)}
            </li>
          ))
        ) : (
          <li>
            {t(
              "Inspect the original role and prepare examples that demonstrate the linked skills.",
            )}
          </li>
        )}
      </ul>
      <Link className="button secondary" href="/jobs/">
        {t("Review published roles and original sources")}
      </Link>
    </article>
  );
}
