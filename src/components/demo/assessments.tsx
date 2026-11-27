"use client";
import { PageHeading } from "../ui/page-heading";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, CheckCircle2, Clock3, RotateCcw, Sparkles } from "lucide-react";
import { questions } from "@/lib/fixtures";
import { localizedDemoQuestion } from "@/lib/fixtures-locale";
import { gradeAssessment, skillLabels, tracks, type Track } from "@/lib/domain";
import { useWorkspace } from "@/lib/workspace";
import { useI18n } from "@/lib/i18n";

export function AssessmentsScreen() {
  const { state, update } = useWorkspace();
  const { t, locale } = useI18n();
  const [track, setTrack] = useState<Track>(state.track);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const items = questions.filter((q) => q.track === track);
  const result = gradeAssessment(items, answers);
  const answered = items.filter((q) => answers[q.id] !== undefined).length;
  function submit() {
    const now = new Date().toISOString();
    const evidence = result.results.map((r) => ({
      skill: r.question.skill,
      source: "scenario" as const,
      level: r.correct ? 1 : 0,
      updatedAt: now,
    }));
    update((s) => ({
      ...s,
      evidence: [
        ...s.evidence.filter(
          (e) => !evidence.some((n) => n.skill === e.skill && n.source === e.source),
        ),
        ...evidence,
      ],
    }));
    setSubmitted(true);
  }
  return (
    <>
      <PageHeading
        eyebrow={t("CURIOSITY OVER PERFECTION")}
        title={t("Find your starting point.")}
        description={t(
          "A few real-world scenarios to see what feels familiar—and what to explore next.",
        )}
      />
      <div className="assessment-layout">
        <section>
          <div className="assessment-toolbar">
            <label className="field-label">
              {t("Your career direction")}
              <select
                className="text-input"
                value={track}
                onChange={(e) => {
                  setTrack(e.target.value as Track);
                  setAnswers({});
                  setSubmitted(false);
                }}
              >
                {tracks.map((option) => (
                  <option key={option} value={option}>
                    {t(option)}
                  </option>
                ))}
              </select>
            </label>
            <span className="pill">
              <Clock3 size={13} />
              {t("About 3 minutes")}
            </span>
          </div>
          {items.map((source, i) => {
            const q = localizedDemoQuestion(source, locale);
            return (
              <article className="panel question-card" key={q.id} lang={q.lang}>
                <span className="mini-label">
                  {t("SCENARIO {n} OF {total}", { n: i + 1, total: items.length })} ·{" "}
                  {t(skillLabels[q.skill]).toUpperCase()}
                </span>
                <h2>{q.prompt}</h2>
                <fieldset disabled={submitted}>
                  <legend className="sr-only">{q.prompt}</legend>
                  {q.options.map((option, j) => (
                    <label
                      className={`answer-option ${answers[q.id] === j ? "chosen" : ""} ${submitted && j === q.correct ? "correct" : ""}`}
                      key={option}
                    >
                      <input
                        type="radio"
                        name={q.id}
                        checked={answers[q.id] === j}
                        onChange={() => setAnswers((a) => ({ ...a, [q.id]: j }))}
                      />
                      <span>{option}</span>
                      {submitted && j === q.correct && <CheckCircle2 size={17} />}
                    </label>
                  ))}
                </fieldset>
                {submitted && (
                  <div className="answer-explanation">
                    <strong>
                      {answers[q.id] === q.correct
                        ? t("A solid starting point.")
                        : t("An opportunity to learn.")}
                    </strong>
                    <p>{q.explanation}</p>
                  </div>
                )}
              </article>
            );
          })}
          <div className="button-row">
            {!submitted ? (
              <button
                className="button primary"
                disabled={answered !== items.length}
                onClick={submit}
              >
                {t("See my starting point")}
                <ArrowRight size={16} />
              </button>
            ) : (
              <>
                <button
                  className="button secondary"
                  onClick={() => {
                    setSubmitted(false);
                    setAnswers({});
                  }}
                >
                  <RotateCcw size={16} />
                  {t("Try again")}
                </button>
                <Link href="/learning/" className="button primary">
                  {t("Explore my learning path")}
                  <ArrowRight size={16} />
                </Link>
              </>
            )}
          </div>
        </section>
        <aside className="assessment-aside panel">
          <span className="large-icon">
            <Sparkles size={28} />
          </span>
          <h2>
            {submitted
              ? t("{correct} of {total} scenarios", {
                  correct: result.correct,
                  total: result.total,
                })
              : t("A check-in, not a verdict.")}
          </h2>
          <p>
            {submitted
              ? t(
                  "Your scenario evidence is now in your skill profile. One short check is a signal, not proof of independent ability.",
                )
              : t(
                  "This open-book preview explores how you think through a situation. It is not a certification or a hiring test.",
                )}
          </p>
          <div className="progress-track">
            <span style={{ width: `${(answered / items.length) * 100}%` }} />
          </div>
          <small>{t("{answered} of {total} answered", { answered, total: items.length })}</small>
          <hr />
          <h3>{t("What happens next?")}</h3>
          <ul className="plain-list">
            <li>
              <Check size={15} />
              {t("See the reasoning behind each answer")}
            </li>
            <li>
              <Check size={15} />
              {t("Add scenario evidence to your profile")}
            </li>
            <li>
              <Check size={15} />
              {t("Choose a practical learning step")}
            </li>
          </ul>
        </aside>
      </div>
    </>
  );
}
