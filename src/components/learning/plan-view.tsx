"use client";
import { Fragment, useState, type ReactNode } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import type { LearningPlan } from "@/modules/learning/model";
import { plannerText } from "./planner-text";

/** Places links into a translated sentence, e.g. "{assessment} or {evidence}.". */
function renderLinks(template: string, links: Record<string, ReactNode>) {
  return template
    .split(/\{(\w+)\}/)
    .map((part, index) => (index % 2 ? <Fragment key={index}>{links[part]}</Fragment> : part));
}

export function LearningPlanView({
  plan,
  busy,
  onCheck,
  onStep,
  onPractice,
  onRemove,
}: {
  plan: LearningPlan;
  busy: boolean;
  onCheck: () => void;
  onStep: (id: string, completed: boolean) => void;
  onPractice: (stepId: string, url: string, summary: string) => void;
  onRemove: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const text = (value: string) => plannerText(value, t);
  /** Reviewed translation of the planned course version; criteria only for full-resource steps. */
  const stepText = (step: LearningPlan["steps"][number]) => {
    const translation = locale === "zh-TW" ? step.translations?.["zh-TW"] : undefined;
    return {
      practicePrompt: translation?.practicePrompt ?? text(step.practicePrompt),
      completionCriteria:
        translation && step.scope === "full-resource"
          ? translation.completionCriteria
          : text(step.completionCriteria),
    };
  };
  const [stepId, setStep] = useState(""),
    [url, setUrl] = useState(""),
    [summary, setSummary] = useState("");
  return (
    <section className="section-block">
      <div className="matching-report-heading">
        <h2>
          {plan.status === "invalidated"
            ? t("Plan content removed")
            : plan.status === "failed"
              ? t("Planning could not finish")
              : ["queued", "running"].includes(plan.status)
                ? t("Learning plan is queued or running")
                : t("Your two-week learning plan")}
        </h2>
        <button className="button secondary" disabled={busy} onClick={onCheck}>
          {t("Check plan status")}
        </button>
      </div>
      {plan.stale && plan.status !== "invalidated" && (
        <p className="notice" role="status">
          {t(
            "This plan uses historical inputs. Create a fresh plan before choosing current resources; your reported progress is kept separately.",
          )}
        </p>
      )}
      {plan.status === "invalidated" && (
        <p className="notice">
          {t(
            "A source evidence record was deleted. Copied planning inputs and generated steps were removed. Your independently submitted practice references remain yours to keep or delete.",
          )}
        </p>
      )}
      {plan.status === "failed" && (
        <p className="notice">
          {t("No partial generated plan is published. Create a fresh plan using current inputs.")}
        </p>
      )}
      {["queued", "running"].includes(plan.status) && (
        <p className="muted">
          {t(
            "The independent worker is planning from saved inputs. You can leave and return to this URL.",
          )}
        </p>
      )}
      {plan.output && (
        <>
          <p className="muted">
            {t(
              "{hours} hours per week · {scheduled} / {budget} minutes scheduled across two weeks. A partial resource is not an entire course completion.",
              {
                hours: plan.weeklyHours,
                scheduled: plan.output.scheduledMinutes,
                budget: plan.output.budgetMinutes,
              },
            )}
          </p>
          {!plan.steps.length && (
            <p className="panel">
              {t(
                "No steps fit the current gaps, resources and time budget. Review the explanations below and adjust the inputs.",
              )}
            </p>
          )}
          <div className="learning-plan-steps">
            {plan.steps.map((step, index) => (
              <article className="panel learning-card" key={step.id}>
                <p className="mini-label">
                  {step.kind === "course"
                    ? t("STAGE {n} · RESOURCE + PRACTICE", { n: index + 1 })
                    : t("STAGE {n} · EDITORIAL PRACTICE", { n: index + 1 })}
                </p>
                <h3>{text(step.title)}</h3>
                <p className="pill">
                  {step.scope === "partial-resource"
                    ? t("Partial resource only")
                    : step.scope === "practice-only"
                      ? t("Practice only")
                      : t("Assigned resource and practice")}
                </p>
                <p>
                  {t("{weeks}. Study {study} min; practice {practice} min.", {
                    weeks: step.weeks
                      .map((part) =>
                        t("Week {week}: {minutes} min", { week: part.week, minutes: part.minutes }),
                      )
                      .join(" · "),
                    study: step.studyMinutes,
                    practice: step.practiceMinutes,
                  })}{" "}
                  {step.remainingMinutes > 0
                    ? t("{n} minutes remain for a later plan.", { n: step.remainingMinutes })
                    : ""}
                </p>
                <p className="muted">
                  {t("Duration basis: {basis}.", { basis: step.durationBasis })}{" "}
                  {step.dependsOn.length
                    ? t("Start after: {steps}.", {
                        steps: step.dependsOn
                          .map(
                            (key) =>
                              plan.steps.find((item) => item.key === key)?.title ||
                              t("the earlier foundation"),
                          )
                          .join(", "),
                      })
                    : ""}
                </p>
                {!step.available && (
                  <p className="notice">
                    {t(
                      "The original resource version is historical or needs confirmation. Review its current source before continuing.",
                    )}
                  </p>
                )}
                <p>{stepText(step).practicePrompt}</p>
                <p>
                  <strong>{t("Completion criteria:")}</strong> {stepText(step).completionCriteria}
                </p>
                <details>
                  <summary>{t("Limits and assumptions")}</summary>
                  <ul>
                    {step.notes.map((note, index) => (
                      <li key={index}>{text(note)}</li>
                    ))}
                  </ul>
                </details>
                <div className="learning-actions">
                  {step.url && (
                    <a
                      className="button secondary"
                      href={step.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("Open assigned resource ↗")}
                    </a>
                  )}
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => onStep(step.id, !step.completed)}
                  >
                    {step.completed ? t("Assigned step done · undo") : t("Mark assigned step done")}
                  </button>
                </div>
              </article>
            ))}
          </div>
          {plan.output.issues.length > 0 && (
            <section className="panel section-block">
              <h3>{t("What still needs attention")}</h3>
              <ul>
                {plan.output.issues.map((issue, index) => (
                  <li key={index}>
                    {issue.skillId ? `${issue.skillId}: ` : ""}
                    {text(issue.reason)}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="muted">
            {t("Course and step completion are user reports. They do not verify a skill.")}{" "}
            {renderLinks(t("{assessment} or {evidence}."), {
              assessment: <Link href="/assessments/">{t("Try a separate assessment")}</Link>,
              evidence: <Link href="/skills/">{t("review your evidence")}</Link>,
            })}
          </p>
        </>
      )}
      {plan.status === "succeeded" && plan.steps.length > 0 && (
        <form
          className="panel section-block"
          onSubmit={(event) => {
            event.preventDefault();
            onPractice(stepId || plan.steps[0].id, url, summary);
          }}
        >
          <h3>{t("Keep a private practice reference")}</h3>
          <p className="muted">
            {t(
              "A reference is stored as your own learning note. It is not graded or added to capability evidence.",
            )}
          </p>
          <fieldset className="profile-form-fields" disabled={busy}>
            <label>
              {t("Assigned step")}
              <select
                className="text-input"
                aria-label={t("Practice assigned step")}
                value={stepId || plan.steps[0].id}
                onChange={(event) => setStep(event.target.value)}
              >
                {plan.steps.map((step) => (
                  <option key={step.id} value={step.id}>
                    {text(step.title)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("HTTPS reference")}
              <input
                aria-label={t("Learning practice URL")}
                className="text-input"
                type="url"
                required
                maxLength={2048}
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            </label>
            <label>
              {t("What you practiced")}
              <textarea
                aria-label={t("Learning practice summary")}
                className="text-input"
                required
                maxLength={1000}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
              />
            </label>
            <button className="button primary">{t("Save private practice reference")}</button>
          </fieldset>
        </form>
      )}
      {plan.practiceSubmissions.length > 0 && (
        <section className="panel section-block">
          <h3>{t("Your independent practice references")}</h3>
          {plan.practiceSubmissions.map((reference) => (
            <article key={reference.id} className="learning-reference">
              <p>{reference.summary}</p>
              <a
                className="text-link"
                href={reference.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("Open my reference ↗")}
              </a>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => onRemove(reference.id)}
              >
                {t("Delete practice reference")}
              </button>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}
