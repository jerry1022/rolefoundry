"use client";
import Link from "next/link";
import { localizedQuestion, type AssessmentAttempt } from "@/modules/assessment/model";
import { useI18n } from "@/lib/i18n";
export function AttemptResult({ attempt }: { attempt: AssessmentAttempt }) {
  const { t, locale } = useI18n();
  const skillName = (item: { skillLabel: string; skillLabelZhTw?: string }) =>
    locale === "zh-TW" ? (item.skillLabelZhTw ?? item.skillLabel) : item.skillLabel;
  const result = attempt.result;
  if (!result) return null;
  return (
    <section className="panel section-block">
      <span className="mini-label">{t("OBSERVED SCENARIO RESULTS")}</span>
      <h2>
        {t("{correct} of {total} scenarios", { correct: result.correct, total: result.total })}
      </h2>
      <p className="muted">
        {t(
          "These results describe this attempt only. An incorrect response does not erase your previous experience. A correct response does not establish independent mastery.",
        )}
      </p>
      <div className="assessment-question-list">
        {attempt.items.map((item) => {
          const observation = result.observations.find((value) => value.itemId === item.id)!;
          const text = localizedQuestion(item, locale);
          return (
            <article className="assessment-question" key={item.id}>
              <h3 lang={text.lang}>{text.prompt}</h3>
              <span className="pill">
                {observation.correct ? t("Correct in this scenario") : t("Worth revisiting")}
              </span>
              <p>
                {t("Your response: {answer}", {
                  answer: text.options[observation.selectedIndex],
                })}
              </p>
              <p>
                {t("Reviewed answer: {answer}", { answer: text.options[observation.correctIndex] })}
              </p>
              <p lang={text.explanation ? text.lang : "en"}>
                {text.explanation ?? observation.explanation}
              </p>
              <small>{t("Skill: {skill}", { skill: skillName(item) })}</small>
              <p className="muted">
                {t(
                  "Next practice: explain the choice in your own words, then build a small example that shows when it applies.",
                )}
              </p>
            </article>
          );
        })}
      </div>
      <Link className="button secondary" href="/skills/">
        {t("View scenario evidence in my profile")}
      </Link>
    </section>
  );
}
