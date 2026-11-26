"use client";
import { useEffect, useRef, useState } from "react";
import { querySchema, type PublishedJob } from "@/modules/jobs/model";
import type { CatalogClient, CatalogTranslationClient } from "@/modules/jobs/ports";
import { msg, useI18n } from "@/lib/i18n";
import { ApplicationError } from "@/modules/platform/errors";
import { TranslationField } from "../ui/translation-field";

type Draft = { title: string; summary: string; responsibilities: string[]; reviewNote: string };
const draftFor = (job: PublishedJob): Draft => {
  const current = job.translations?.["zh-TW"];
  return {
    title: current?.title ?? "",
    summary: current?.summary ?? "",
    responsibilities: job.responsibilities.map(
      (_, index) => current?.responsibilities[index] ?? "",
    ),
    reviewNote: "",
  };
};
const failure = (error: unknown, fallback: string) =>
  error instanceof ApplicationError ? error.message : fallback;

/**
 * Reviewed zh-TW text for the current version of a published job. Saving binds the text to that
 * exact version: a later revision hides it until someone reviews the new version.
 */
export function JobTranslationAdministration({
  catalog,
  translations,
}: {
  catalog: CatalogClient;
  translations: CatalogTranslationClient;
}) {
  const { t, fmt } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublishedJob[]>([]);
  const [job, setJob] = useState<PublishedJob>();
  const [draft, setDraft] = useState<Draft>();
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      catalog
        .list(querySchema.parse({ q: query, limit: 10 }), controller.signal)
        .then((page) => {
          setResults(page.data);
          setError("");
        })
        .catch((reason) => {
          if (!controller.signal.aborted)
            setError(failure(reason, msg("Published jobs are temporarily unavailable.")));
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [catalog, query]);

  // Only the most recent selection may populate the form (a slow earlier load is ignored).
  const latest = useRef("");
  async function open(id: string) {
    latest.current = id;
    setError("");
    setStatus("");
    try {
      const value = await catalog.find(id);
      if (latest.current !== id) return null;
      setJob(value);
      setDraft(draftFor(value));
      return value;
    } catch (reason) {
      if (latest.current === id) setError(failure(reason, msg("The job could not be loaded.")));
      return null;
    }
  }

  async function run(action: "save" | "remove") {
    if (!job || !draft || busy || !draft.reviewNote.trim()) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      if (action === "save")
        await translations.translate(job.id, {
          versionId: job.versionId,
          locale: "zh-TW",
          ...draft,
        });
      else
        await translations.removeTranslation(job.id, {
          versionId: job.versionId,
          locale: "zh-TW",
          reason: draft.reviewNote,
        });
      if (!(await open(job.id))) return;
      setStatus(action === "save" ? msg("Translation saved.") : msg("Translation removed."));
    } catch (reason) {
      setError(failure(reason, msg("The change could not be confirmed. Refresh before retrying.")));
    } finally {
      setBusy(false);
    }
  }

  const complete =
    draft &&
    draft.title.trim() &&
    draft.summary.trim() &&
    draft.reviewNote.trim() &&
    draft.responsibilities.every((line) => line.trim());

  return (
    <div className="job-translations">
      <p className="muted">
        {t(
          "Translate the current published version only. The translation is shown to Traditional Chinese readers until the job is revised.",
        )}
      </p>
      <label className="profile-field">
        <span>{t("Find a published job")}</span>
        <input
          className="text-input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <ul className="job-translation-results">
        {results.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={item.id === job?.id ? "selected" : ""}
              aria-pressed={item.id === job?.id}
              disabled={busy}
              onClick={() => void open(item.id)}
            >
              <strong>{item.title}</strong>
              <small>
                {item.company} · {t("Version {version}", { version: item.version })}
                {item.translations?.["zh-TW"] ? ` · ${t("Translated")}` : ""}
              </small>
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p className="notice warning" role="alert">
          {t(error)}
        </p>
      )}
      {status && <p role="status">{t(status)}</p>}
      {job && draft && (
        <form
          className="job-translation-form"
          onSubmit={(event) => {
            event.preventDefault();
            void run("save");
          }}
        >
          <h3>
            {job.title} · {t("Version {version}", { version: job.version })}
          </h3>
          {job.translations?.["zh-TW"] && (
            <p className="muted">
              {t("Last reviewed {date}", {
                date: fmt.date(job.translations["zh-TW"].reviewedAt),
              })}
            </p>
          )}
          <TranslationField
            source={job.title}
            label={t("Title (Traditional Chinese)")}
            maxLength={200}
            value={draft.title}
            onChange={(title) => setDraft({ ...draft, title })}
          />
          <TranslationField
            source={job.summary}
            label={t("Summary (Traditional Chinese)")}
            maxLength={3000}
            multiline
            value={draft.summary}
            onChange={(summary) => setDraft({ ...draft, summary })}
          />
          {job.responsibilities.map((line, index) => (
            <TranslationField
              key={index}
              source={line}
              label={t("Responsibility {number} (Traditional Chinese)", { number: index + 1 })}
              maxLength={1000}
              value={draft.responsibilities[index]}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  responsibilities: draft.responsibilities.map((item, position) =>
                    position === index ? value : item,
                  ),
                })
              }
            />
          ))}
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
            {job.translations?.["zh-TW"] && (
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
