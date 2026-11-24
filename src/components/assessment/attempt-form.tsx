"use client";
import { useEffect, useRef, useState } from "react";
import type { AssessmentAttempt } from "@/modules/assessment/model";
import type { AssessmentClient } from "@/modules/assessment/ports";
import { ApplicationError } from "@/modules/platform/errors";
import { useI18n } from "@/lib/i18n";
export function AttemptForm({
  initial,
  client,
  onChanged,
  onReload,
}: {
  initial: AssessmentAttempt;
  client: AssessmentClient;
  onChanged: (attempt: AssessmentAttempt) => void;
  onReload: () => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const skillName = (item: { skillLabel: string; skillLabelZhTw?: string }) =>
    locale === "zh-TW" ? (item.skillLabelZhTw ?? item.skillLabel) : item.skillLabel;
  const [answers, setAnswers] = useState(initial.answers),
    [saved, setSaved] = useState(initial),
    [saving, setSaving] = useState(false),
    [submitting, setSubmitting] = useState(false),
    [sealed, setSealed] = useState(false),
    [error, setError] = useState("");
  const current = useRef(initial),
    latest = useRef(initial.answers),
    working = useRef(false),
    blocked = useRef(false),
    key = useRef(crypto.randomUUID());
  const equalAnswers = (left: typeof answers, right: typeof answers) =>
    Object.keys(left).length === Object.keys(right).length &&
    Object.entries(left).every(([id, value]) => right[id] === value);
  const dirty = !equalAnswers(answers, saved.answers);
  async function flush() {
    if (working.current || blocked.current || sealed) return;
    working.current = true;
    setSaving(true);
    try {
      while (!equalAnswers(current.current.answers, latest.current)) {
        const next = await client.save(initial.id, {
          expectedRevision: current.current.revision,
          answers: latest.current,
        });
        current.current = next;
        setSaved(next);
        onChanged(next);
      }
    } catch (error) {
      blocked.current = true;
      setError(
        error instanceof ApplicationError
          ? error.message
          : t("Draft saving failed. Reload before continuing."),
      );
    } finally {
      working.current = false;
      setSaving(false);
    }
  }
  useEffect(() => {
    if (!dirty || sealed) return;
    const timer = setTimeout(() => void flush(), 400);
    return () => clearTimeout(timer);
  }, [answers, dirty, sealed]);
  async function submit() {
    if (dirty || working.current || blocked.current) return;
    setSubmitting(true);
    setSealed(true);
    setError("");
    try {
      await client.submit(initial.id, {
        expectedRevision: current.current.revision,
        answers: latest.current,
        idempotencyKey: key.current,
      });
      onChanged(await client.find(initial.id));
    } catch (error) {
      setError(
        error instanceof ApplicationError
          ? error.message
          : t("Submission could not be confirmed. Check the saved assessment before retrying."),
      );
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <section className="panel section-block">
      <h2>{t("{track} scenarios", { track: t(initial.track) })}</h2>
      <p className="muted">
        {t(
          "Answers save automatically. Submit seals this version for scoring; this is a narrow observation, not certification.",
        )}
      </p>
      {error && (
        <div className="notice" role="alert">
          <p>{error}</p>
          <button
            className="button secondary"
            disabled={saving || submitting}
            onClick={() => void onReload()}
          >
            {t("Reload saved assessment")}
          </button>
        </div>
      )}
      <fieldset disabled={sealed || submitting} className="assessment-question-list">
        {initial.items.map((item, index) => (
          <fieldset key={item.id} className="assessment-question">
            <legend>
              {index + 1}. {item.prompt}
            </legend>
            <p className="muted">{skillName(item)}</p>
            {item.options.map((option, optionIndex) => (
              <label key={optionIndex}>
                <input
                  type="radio"
                  name={`item-${item.id}`}
                  checked={answers[item.id] === optionIndex}
                  onChange={() => {
                    const next = { ...latest.current, [item.id]: optionIndex };
                    latest.current = next;
                    setAnswers(next);
                  }}
                />
                {option}
              </label>
            ))}
          </fieldset>
        ))}
      </fieldset>
      <div className="assessment-submit-row">
        <p role="status" className="muted">
          {saving || dirty ? t("Saving draft…") : t("All answers saved.")}
        </p>
        <button
          className="button primary"
          disabled={
            saving ||
            dirty ||
            submitting ||
            blocked.current ||
            Object.keys(answers).length !== initial.items.length
          }
          onClick={() => void submit()}
        >
          {submitting
            ? t("Confirming submission…")
            : sealed
              ? t("Retry the same submission")
              : t("Submit for scoring")}
        </button>
      </div>
    </section>
  );
}
