"use client";
import { useEffect, useState } from "react";
import { querySchema, type PublishedJob } from "@/modules/jobs/model";
import type { CatalogClient, CatalogTranslationClient } from "@/modules/jobs/ports";
import { msg, useI18n } from "@/lib/i18n";
import { ApplicationError } from "@/modules/platform/errors";

type Draft = { title: string; summary: string; responsibilities: string[]; reviewNote: string };
const emptyDraft = (job: PublishedJob): Draft => {
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
        .then((page) => setResults(page.data))
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

  async function open(id: string) {
    setError("");
    setStatus("");
    try {
      const value = await catalog.find(id);
      setJob(value);
      setDraft(emptyDraft(value));
    } catch (reason) {
      setError(failure(reason, msg("The job could not be loaded.")));
    }
  }

  async function run(action: "save" | "remove") {
    if (!job || !draft || busy) return;
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
        await translations.removeTranslation(job.id, { versionId: job.versionId, locale: "zh-TW" });
      await open(job.id);
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
          <div className="job-translation-pair">
            <p className="source">{job.title}</p>
            <label>
              <span>{t("Title (Traditional Chinese)")}</span>
              <input
                className="text-input"
                lang="zh-Hant"
                maxLength={200}
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </label>
          </div>
          <div className="job-translation-pair">
            <p className="source">{job.summary}</p>
            <label>
              <span>{t("Summary (Traditional Chinese)")}</span>
              <textarea
                className="text-input"
                lang="zh-Hant"
                rows={4}
                maxLength={3000}
                value={draft.summary}
                onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
              />
            </label>
          </div>
          {job.responsibilities.map((line, index) => (
            <div className="job-translation-pair" key={index}>
              <p className="source">{line}</p>
              <label>
                <span>
                  {t("Responsibility {number} (Traditional Chinese)", { number: index + 1 })}
                </span>
                <input
                  className="text-input"
                  lang="zh-Hant"
                  maxLength={1000}
                  value={draft.responsibilities[index]}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      responsibilities: draft.responsibilities.map((value, position) =>
                        position === index ? event.target.value : value,
                      ),
                    })
                  }
                />
              </label>
            </div>
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
                disabled={busy}
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
