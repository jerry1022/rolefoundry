"use client";
import Link from "next/link";
import type { MatchRun } from "@/modules/matching/model";
import { skillLabel } from "@/modules/skills/model";
const actions = {
  "explore-now": "Explore this opportunity",
  "strengthen-evidence": "Strengthen the supporting evidence",
  "longer-term-target": "Consider a longer-term target",
  "condition-conflict": "Review an explicit condition conflict",
};
export function MatchingResultCard({
  result,
  historical,
  labels,
}: {
  result: MatchRun["data"][number];
  historical: boolean;
  labels: Record<string, string>;
}) {
  return (
    <article className="panel matching-result">
      <p className="mini-label">{result.company}</p>
      <h3>{result.title}</h3>
      <p className="pill">
        {!result.available
          ? "Historical role · no longer available"
          : historical
            ? "Historical report · refresh before using"
            : actions[result.action]}
      </p>
      <p>
        Mandatory skills with linked support:{" "}
        <strong>
          {result.coverage.mandatory.covered} / {result.coverage.mandatory.total}
        </strong>
        . Preferred:{" "}
        <strong>
          {result.coverage.preferred.covered} / {result.coverage.preferred.total}
        </strong>
        .
      </p>
      <p className="muted">
        Support may be self-reported or an unreviewed reference. These counts are not hiring
        probabilities or verified competency levels.
      </p>
      {result.freshness === "uncertain" && (
        <p className="notice">
          The source could not recently confirm availability. Check the original role before
          planning an application.
        </p>
      )}
      <h4>Conditions</h4>
      <ul className="matching-conditions">
        {result.conditions.map((condition) => (
          <li key={condition.field}>
            <span className="pill">{condition.status}</span>{" "}
            <strong>
              {condition.field === "experienceYears"
                ? "Experience"
                : condition.field === "workAuthorization"
                  ? "Work authorization"
                  : condition.field === "education"
                    ? "Education"
                    : condition.field === "seniority"
                      ? "Seniority"
                      : "Workplace"}
            </strong>
            : {condition.requirement || "Not supplied"}
            <p className="muted">{condition.reason}</p>
          </li>
        ))}
      </ul>
      <h4>Requirements and their supporting sources</h4>
      {result.requirements.map((requirement) => (
        <section className="matching-requirement" key={requirement.ordinal}>
          <p>
            <strong>{requirement.priority === "mandatory" ? "Mandatory" : "Preferred"}</strong> ·{" "}
            {requirement.text}
          </p>
          {!requirement.skills.length && (
            <p className="muted">This text has no reviewed skill mapping. Check it directly.</p>
          )}
          {requirement.skills.map((skill) => (
            <div key={skill.skillId}>
              <strong>{skillLabel(skill.skillId, labels)}</strong>
              {!skill.support.length && (
                <p className="muted">No linked support. This does not prove inability.</p>
              )}
              {[...skill.support, ...skill.practice].map((reference) => (
                <details key={reference.versionId} className="matching-reference">
                  <summary>
                    {reference.label} · {reference.source}
                    {reference.signal === "practice"
                      ? " · needs practice"
                      : reference.signal === "support"
                        ? " · observed in one scenario"
                        : " · unverified"}
                  </summary>
                  <p>{reference.context || "No additional context supplied."}</p>
                  <Link href="/skills/">Review this evidence in my profile</Link>
                </details>
              ))}
            </div>
          ))}
        </section>
      ))}
      {result.available && (
        <Link className="button secondary" href={`/learning/?job=${result.jobId}`}>
          Plan learning for this role
        </Link>
      )}
      <h4>Useful next actions</h4>
      <ul>
        {result.gaps.length ? (
          result.gaps.map((gap, index) => (
            <li key={index}>
              {gap.skillId ? `${skillLabel(gap.skillId, labels)}: ` : ""}
              {gap.reason}
            </li>
          ))
        ) : (
          <li>
            Inspect the original role and prepare examples that demonstrate the linked skills.
          </li>
        )}
      </ul>
      <Link className="button secondary" href="/jobs/">
        Review published roles and original sources
      </Link>
    </article>
  );
}
