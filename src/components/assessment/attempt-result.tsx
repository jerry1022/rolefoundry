"use client";
import Link from "next/link";
import type { AssessmentAttempt } from "@/modules/assessment/model";
export function AttemptResult({ attempt }: { attempt: AssessmentAttempt }) {
  const result = attempt.result;
  if (!result) return null;
  return (
    <section className="panel section-block">
      <span className="mini-label">OBSERVED SCENARIO RESULTS</span>
      <h2>
        {result.correct} of {result.total} scenarios
      </h2>
      <p className="muted">
        These results describe this attempt only. An incorrect response does not erase your previous
        experience. A correct response does not establish independent mastery.
      </p>
      <div className="assessment-question-list">
        {attempt.items.map((item) => {
          const observation = result.observations.find((value) => value.itemId === item.id)!;
          return (
            <article className="assessment-question" key={item.id}>
              <h3>{item.prompt}</h3>
              <span className="pill">
                {observation.correct ? "Correct in this scenario" : "Worth revisiting"}
              </span>
              <p>Your response: {item.options[observation.selectedIndex]}</p>
              <p>Reviewed answer: {item.options[observation.correctIndex]}</p>
              <p>{observation.explanation}</p>
              <small>Skill: {item.skillLabel}</small>
              <p className="muted">
                Next practice: explain the choice in your own words, then build a small example that
                shows when it applies.
              </p>
            </article>
          );
        })}
      </div>
      <Link className="button secondary" href="/skills/">
        View scenario evidence in my profile
      </Link>
    </section>
  );
}
