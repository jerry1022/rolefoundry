"use client";
import { useState } from "react";
import type { QuestionBank } from "@/modules/assessment/model";
import type { AssessmentAdminClient } from "@/modules/assessment/ports";
import { useI18n } from "@/lib/i18n";
import { TranslationField } from "../ui/translation-field";

type Question = QuestionBank["questions"][number];

/**
 * Reviewed zh-TW text for one immutable question version. Options are translated one-to-one in
 * source order so the answer key and grading stay the same.
 */
export function QuestionTranslationForm({
  question,
  client,
  busy,
  onMutation,
}: {
  question: Question;
  client: AssessmentAdminClient;
  busy: boolean;
  onMutation: (work: () => Promise<unknown>) => Promise<void>;
}) {
  const { t, fmt } = useI18n();
  const current = question.translations?.["zh-TW"];
  const [draft, setDraft] = useState({
    prompt: current?.prompt ?? "",
    options: question.options.map((_, index) => current?.options[index] ?? ""),
    explanation: current?.explanation ?? "",
    reviewNote: "",
  });
  const complete =
    draft.prompt.trim() &&
    draft.explanation.trim() &&
    draft.reviewNote.trim() &&
    draft.options.every((option) => option.trim());

  return (
    <details className="question-translation">
      <summary>
        {current
          ? t("Traditional Chinese translation · reviewed {date}", {
              date: fmt.date(current.reviewedAt),
            })
          : t("Add a Traditional Chinese translation")}
      </summary>
      <form
        className="job-translation-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (complete)
            void onMutation(() => client.translate(question.id, { locale: "zh-TW", ...draft }));
        }}
      >
        <TranslationField
          source={question.prompt}
          label={t("Prompt (Traditional Chinese)")}
          maxLength={3000}
          multiline
          value={draft.prompt}
          onChange={(prompt) => setDraft({ ...draft, prompt })}
        />
        {question.options.map((option, index) => (
          <TranslationField
            key={index}
            source={option}
            label={t("Option {number} (Traditional Chinese)", { number: index + 1 })}
            maxLength={1000}
            value={draft.options[index]}
            onChange={(value) =>
              setDraft({
                ...draft,
                options: draft.options.map((item, position) => (position === index ? value : item)),
              })
            }
          />
        ))}
        <TranslationField
          source={question.explanation}
          label={t("Explanation (Traditional Chinese)")}
          maxLength={3000}
          multiline
          value={draft.explanation}
          onChange={(explanation) => setDraft({ ...draft, explanation })}
        />
        <label className="profile-field">
          <span>{t("Review note")}</span>
          <input
            className="text-input"
            maxLength={1000}
            value={draft.reviewNote}
            placeholder={t("Who reviewed it and against which source")}
            onChange={(event) => setDraft({ ...draft, reviewNote: event.target.value })}
          />
        </label>
        <div className="actions">
          <button className="button" type="submit" disabled={busy || !complete}>
            {t("Save reviewed translation")}
          </button>
          {current && (
            <button
              className="button secondary"
              type="button"
              disabled={busy || !draft.reviewNote.trim()}
              onClick={() =>
                void onMutation(() =>
                  client.removeTranslation(question.id, {
                    locale: "zh-TW",
                    reason: draft.reviewNote,
                  }),
                )
              }
            >
              {t("Remove translation")}
            </button>
          )}
        </div>
      </form>
    </details>
  );
}
