"use client";
import { useState } from "react";
import Link from "next/link";
import type { LearningPlan } from "@/modules/learning/model";
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
  const [stepId, setStep] = useState(""),
    [url, setUrl] = useState(""),
    [summary, setSummary] = useState("");
  return (
    <section className="section-block">
      <div className="matching-report-heading">
        <h2>
          {plan.status === "invalidated"
            ? "Plan content removed"
            : plan.status === "failed"
              ? "Planning could not finish"
              : ["queued", "running"].includes(plan.status)
                ? "Learning plan is queued or running"
                : "Your two-week learning plan"}
        </h2>
        <button className="button secondary" disabled={busy} onClick={onCheck}>
          Check plan status
        </button>
      </div>
      {plan.stale && plan.status !== "invalidated" && (
        <p className="notice" role="status">
          This plan uses historical inputs. Create a fresh plan before choosing current resources;
          your reported progress is kept separately.
        </p>
      )}
      {plan.status === "invalidated" && (
        <p className="notice">
          A source evidence record was deleted. Copied planning inputs and generated steps were
          removed. Your independently submitted practice references remain yours to keep or delete.
        </p>
      )}
      {plan.status === "failed" && (
        <p className="notice">
          No partial generated plan is published. Create a fresh plan using current inputs.
        </p>
      )}
      {["queued", "running"].includes(plan.status) && (
        <p className="muted">
          The independent worker is planning from saved inputs. You can leave and return to this
          URL.
        </p>
      )}
      {plan.output && (
        <>
          <p className="muted">
            {plan.weeklyHours} hours per week · {plan.output.scheduledMinutes} /{" "}
            {plan.output.budgetMinutes} minutes scheduled across two weeks. A partial resource is
            not an entire course completion.
          </p>
          {!plan.steps.length && (
            <p className="panel">
              No steps fit the current gaps, resources and time budget. Review the explanations
              below and adjust the inputs.
            </p>
          )}
          <div className="learning-plan-steps">
            {plan.steps.map((step, index) => (
              <article className="panel learning-card" key={step.id}>
                <p className="mini-label">
                  STAGE {index + 1} ·{" "}
                  {step.kind === "course" ? "RESOURCE + PRACTICE" : "EDITORIAL PRACTICE"}
                </p>
                <h3>{step.title}</h3>
                <p className="pill">
                  {step.scope === "partial-resource"
                    ? "Partial resource only"
                    : step.scope === "practice-only"
                      ? "Practice only"
                      : "Assigned resource and practice"}
                </p>
                <p>
                  {step.weeks.map((part) => `Week ${part.week}: ${part.minutes} min`).join(" · ")}.
                  Study {step.studyMinutes} min; practice {step.practiceMinutes} min.{" "}
                  {step.remainingMinutes > 0
                    ? `${step.remainingMinutes} minutes remain for a later plan.`
                    : ""}
                </p>
                <p className="muted">
                  Duration basis: {step.durationBasis}.{" "}
                  {step.dependsOn.length
                    ? `Start after: ${step.dependsOn.map((key) => plan.steps.find((item) => item.key === key)?.title || "the earlier foundation").join(", ")}.`
                    : ""}
                </p>
                {!step.available && (
                  <p className="notice">
                    The original resource version is historical or needs confirmation. Review its
                    current source before continuing.
                  </p>
                )}
                <p>{step.practicePrompt}</p>
                <p>
                  <strong>Completion criteria:</strong> {step.completionCriteria}
                </p>
                <details>
                  <summary>Limits and assumptions</summary>
                  <ul>
                    {step.notes.map((note, index) => (
                      <li key={index}>{note}</li>
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
                      Open assigned resource ↗
                    </a>
                  )}
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => onStep(step.id, !step.completed)}
                  >
                    {step.completed ? "Assigned step done · undo" : "Mark assigned step done"}
                  </button>
                </div>
              </article>
            ))}
          </div>
          {plan.output.issues.length > 0 && (
            <section className="panel section-block">
              <h3>What still needs attention</h3>
              <ul>
                {plan.output.issues.map((issue, index) => (
                  <li key={index}>
                    {issue.skillId ? `${issue.skillId}: ` : ""}
                    {issue.reason}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="muted">
            Course and step completion are user reports. They do not verify a skill.{" "}
            <Link href="/assessments/">Try a separate assessment</Link> or{" "}
            <Link href="/skills/">review your evidence</Link>.
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
          <h3>Keep a private practice reference</h3>
          <p className="muted">
            A reference is stored as your own learning note. It is not graded or added to capability
            evidence.
          </p>
          <fieldset className="profile-form-fields" disabled={busy}>
            <label>
              Assigned step
              <select
                className="text-input"
                aria-label="Practice assigned step"
                value={stepId || plan.steps[0].id}
                onChange={(event) => setStep(event.target.value)}
              >
                {plan.steps.map((step) => (
                  <option key={step.id} value={step.id}>
                    {step.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              HTTPS reference
              <input
                aria-label="Learning practice URL"
                className="text-input"
                type="url"
                required
                maxLength={2048}
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            </label>
            <label>
              What you practiced
              <textarea
                aria-label="Learning practice summary"
                className="text-input"
                required
                maxLength={1000}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
              />
            </label>
            <button className="button primary">Save private practice reference</button>
          </fieldset>
        </form>
      )}
      {plan.practiceSubmissions.length > 0 && (
        <section className="panel section-block">
          <h3>Your independent practice references</h3>
          {plan.practiceSubmissions.map((reference) => (
            <article key={reference.id} className="learning-reference">
              <p>{reference.summary}</p>
              <a
                className="text-link"
                href={reference.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open my reference ↗
              </a>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => onRemove(reference.id)}
              >
                Delete practice reference
              </button>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}
