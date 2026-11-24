"use client";
import { useEffect, useState } from "react";
import type { LearningCourse } from "@/modules/learning/model";
import type { CourseClient, LearningAdminClient } from "@/modules/learning/ports";
import { msg, useI18n } from "@/lib/i18n";
import { ApplicationError } from "@/modules/platform/errors";
import { TranslationField } from "../ui/translation-field";

type Draft = {
  summary: string;
  practicePrompt: string;
  completionCriteria: string;
  reviewNote: string;
};
const draftFor = (course: LearningCourse): Draft => {
  const current = course.translations?.["zh-TW"];
  return {
    summary: current?.summary ?? "",
    practicePrompt: current?.practicePrompt ?? "",
    completionCriteria: current?.completionCriteria ?? "",
    reviewNote: "",
  };
};
const failure = (error: unknown, fallback: string) =>
  error instanceof ApplicationError ? error.message : fallback;

/**
 * Reviewed zh-TW editorial text for the published version of a course. Official titles stay in
 * the provider's language because they name the linked page.
 */
export function CourseTranslationAdministration({
  courses,
  admin,
}: {
  courses: CourseClient;
  admin: LearningAdminClient;
}) {
  const { t, fmt } = useI18n();
  const [list, setList] = useState<LearningCourse[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [course, setCourse] = useState<LearningCourse>();
  const [draft, setDraft] = useState<Draft>();
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(next?: string) {
    try {
      const page = await courses.list(next ? { cursor: next } : {});
      setList((current) => (next ? [...current, ...page.data] : page.data));
      setCursor(page.nextCursor);
    } catch (reason) {
      setError(failure(reason, msg("Published courses are temporarily unavailable.")));
    }
  }
  useEffect(() => {
    void load();
    // Load the first page once per client.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses]);

  async function open(id: string) {
    setError("");
    setStatus("");
    try {
      const value = await courses.find(id);
      setCourse(value);
      setDraft(draftFor(value));
    } catch (reason) {
      setError(failure(reason, msg("The course could not be loaded.")));
    }
  }

  async function run(action: "save" | "remove") {
    if (!course || !draft || busy || !draft.reviewNote.trim()) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      if (action === "save")
        await admin.translate(course.id, {
          versionId: course.versionId,
          locale: "zh-TW",
          ...draft,
        });
      else
        await admin.removeTranslation(course.id, {
          versionId: course.versionId,
          locale: "zh-TW",
          reason: draft.reviewNote,
        });
      await open(course.id);
      setStatus(action === "save" ? msg("Translation saved.") : msg("Translation removed."));
    } catch (reason) {
      setError(failure(reason, msg("The change could not be confirmed. Refresh before retrying.")));
    } finally {
      setBusy(false);
    }
  }

  const complete =
    draft &&
    draft.summary.trim() &&
    draft.practicePrompt.trim() &&
    draft.completionCriteria.trim() &&
    draft.reviewNote.trim();
  const update = (field: keyof Draft) => (value: string) =>
    setDraft((current) => current && { ...current, [field]: value });

  return (
    <div className="job-translations">
      <p className="muted">
        {t(
          "Translate RoleFoundry's editorial notes for the published version. Official course titles stay in the provider's language.",
        )}
      </p>
      <ul className="job-translation-results">
        {list.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={item.id === course?.id ? "selected" : ""}
              aria-pressed={item.id === course?.id}
              onClick={() => void open(item.id)}
            >
              <strong>{item.title}</strong>
              <small>
                {item.providerName} · {t("Version {version}", { version: item.version })}
                {item.translations?.["zh-TW"] ? ` · ${t("Translated")}` : ""}
              </small>
            </button>
          </li>
        ))}
      </ul>
      {cursor && (
        <button className="button secondary" type="button" onClick={() => void load(cursor)}>
          {t("Load more courses")}
        </button>
      )}
      {error && (
        <p className="notice warning" role="alert">
          {t(error)}
        </p>
      )}
      {status && <p role="status">{t(status)}</p>}
      {course && draft && (
        <form
          className="job-translation-form"
          onSubmit={(event) => {
            event.preventDefault();
            void run("save");
          }}
        >
          <h3>
            {course.title} · {t("Version {version}", { version: course.version })}
          </h3>
          {course.translations?.["zh-TW"] && (
            <p className="muted">
              {t("Last reviewed {date}", {
                date: fmt.date(course.translations["zh-TW"].reviewedAt),
              })}
            </p>
          )}
          <TranslationField
            source={course.summary}
            label={t("Summary (Traditional Chinese)")}
            maxLength={2000}
            multiline
            value={draft.summary}
            onChange={update("summary")}
          />
          <TranslationField
            source={course.practice.prompt}
            label={t("Practice prompt (Traditional Chinese)")}
            maxLength={1000}
            multiline
            value={draft.practicePrompt}
            onChange={update("practicePrompt")}
          />
          <TranslationField
            source={course.practice.completionCriteria}
            label={t("Completion criteria (Traditional Chinese)")}
            maxLength={1000}
            value={draft.completionCriteria}
            onChange={update("completionCriteria")}
          />
          <label className="profile-field">
            <span>{t("Review note")}</span>
            <input
              className="text-input"
              maxLength={1000}
              value={draft.reviewNote}
              placeholder={t("Who reviewed it and against which source")}
              onChange={(event) => update("reviewNote")(event.target.value)}
            />
          </label>
          <div className="actions">
            <button className="button" type="submit" disabled={busy || !complete}>
              {t("Save reviewed translation")}
            </button>
            {course.translations?.["zh-TW"] && (
              <button
                className="button secondary"
                type="button"
                disabled={busy || !draft.reviewNote.trim()}
                onClick={() => void run("remove")}
              >
                {t("Remove translation")}
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
