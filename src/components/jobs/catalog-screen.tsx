"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PageHeading } from "../ui/page-heading";
import { CareerPathBrowser } from "../career-path-browser";
import { careerPathIds, type CareerPathId } from "@/modules/jobs/specializations";
import { tracks } from "@/modules/skills/catalog";
import {
  jobLevels,
  workplaces,
  querySchema,
  type JobQuery,
  type CatalogPage,
  type PublishedJob,
} from "@/modules/jobs/model";
import type { CatalogClient, BookmarkClient } from "@/modules/jobs/ports";
import { ApplicationError } from "@/modules/platform/errors";
import { msg, useI18n } from "@/lib/i18n";
import { JobCard, levelLabels } from "./job-card";
import { JobDetails } from "./job-details";
import { BookmarksPanel } from "./bookmarks-panel";
export function CatalogScreen({
  catalog,
  bookmarks,
  initialPage,
  initialError,
}: {
  catalog: CatalogClient;
  bookmarks: BookmarkClient;
  initialPage?: CatalogPage;
  initialError?: string;
}) {
  const { t } = useI18n();
  const [filters, setFilters] = useState({
    q: "",
    track: "",
    workplace: "",
    location: "",
    level: "",
  });
  const [query, setQuery] = useState<JobQuery>(querySchema.parse({})),
    [page, setPage] = useState<CatalogPage | null>(initialPage || null),
    [selected, setSelected] = useState<PublishedJob | null>(null);
  const [loading, setLoading] = useState(!initialPage && !initialError),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [login, setLogin] = useState(false),
    [tab, setTab] = useState<"catalog" | "saved">("catalog");
  const [saved, setSaved] = useState<Set<string>>(new Set());
  function failed(error: unknown) {
    setError(
      error instanceof ApplicationError
        ? error.message
        : msg("Unable to load the catalog. Try again."),
    );
    setLogin(error instanceof ApplicationError && error.status === 401);
  }
  function refreshSaved() {
    void bookmarks
      .list({ limit: 50 })
      .then((value) => setSaved(new Set(value.data.map((item) => item.jobId))))
      .catch(() => setSaved(new Set()));
  }
  useEffect(() => {
    refreshSaved();
  }, [bookmarks]);
  const firstQuery = useRef(true);
  useEffect(() => {
    if (firstQuery.current && initialPage) {
      firstQuery.current = false;
      return;
    }
    firstQuery.current = false;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void catalog
      .list(query, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setPage(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted) failed(error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [catalog, query]);
  function apply(specialization: CareerPathId | "all" = query.specialization || "all") {
    const input = {
      ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== "")),
      ...(specialization === "all" ? {} : { specialization }),
    };
    const value = querySchema.safeParse(input);
    if (value.success) setQuery(value.data);
    else setError(msg("Check the search fields and try again."));
  }
  async function open(id: string) {
    setError("");
    try {
      setSelected(await catalog.find(id));
    } catch (error) {
      failed(error);
    }
  }
  async function save(job: PublishedJob) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const already = saved.has(job.id);
      await (already ? bookmarks.remove(job.id) : bookmarks.save(job.id));
      setSaved((current) => {
        const next = new Set(current);
        if (already) next.delete(job.id);
        else next.add(job.id);
        return next;
      });
      setNotice(
        already
          ? msg("Saved role removed.")
          : msg("Role saved privately to your account. No application was sent."),
      );
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  }
  const counts = Object.fromEntries(
    careerPathIds.map((id) => [id, page?.counts[id] || 0]),
  ) as Record<CareerPathId, number>;
  return (
    <>
      <PageHeading
        eyebrow={t("PUBLISHED ROLES · TRACEABLE SOURCES")}
        title={t("Find your kind of next.")}
        description={t(
          "Browse published AI roles without an account. Sources and unknown requirements stay visible; this catalog does not claim complete market coverage.",
        )}
      />
      <div className="button-row">
        <button
          className={`button ${tab === "catalog" ? "primary" : "secondary"}`}
          onClick={() => setTab("catalog")}
        >
          {t("Browse roles")}
        </button>
        <button
          className={`button ${tab === "saved" ? "primary" : "secondary"}`}
          onClick={() => setTab("saved")}
        >
          {t("My saved roles")}
        </button>
      </div>
      {error && (
        <div className="notice section-block" role="alert">
          <p>{t(error)}</p>
          {login && (
            <Link className="button secondary" href="/account/">
              {t("Sign in to save roles")}
            </Link>
          )}
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => setQuery({ ...query, cursor: undefined })}
          >
            {t("Reload catalog")}
          </button>
        </div>
      )}
      {notice && (
        <p className="notice" role="status">
          {t(notice)}
        </p>
      )}
      {tab === "saved" ? (
        <BookmarksPanel client={bookmarks} onOpen={open} onChange={refreshSaved} />
      ) : (
        <>
          <form
            className="panel catalog-search section-block"
            onSubmit={(event) => {
              event.preventDefault();
              apply();
            }}
          >
            <label>
              {t("Search jobs")}
              <input
                className="text-input"
                aria-label={t("Search jobs")}
                maxLength={200}
                placeholder={t("Title, company, skills or specialization")}
                value={filters.q}
                onChange={(event) => setFilters({ ...filters, q: event.target.value })}
              />
            </label>
            <div className="catalog-filter-grid">
              <label>
                {t("Career track")}
                <select
                  className="text-input"
                  aria-label={t("Career track")}
                  value={filters.track}
                  onChange={(event) => setFilters({ ...filters, track: event.target.value })}
                >
                  <option value="">{t("All tracks")}</option>
                  {tracks.map((track) => (
                    <option key={track} value={track}>
                      {t(track)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("Workplace")}
                <select
                  className="text-input"
                  aria-label={t("Workplace")}
                  value={filters.workplace}
                  onChange={(event) => setFilters({ ...filters, workplace: event.target.value })}
                >
                  <option value="">{t("Any workplace")}</option>
                  {workplaces.map((mode) => (
                    <option key={mode} value={mode}>
                      {t(mode)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("Location")}
                <input
                  className="text-input"
                  aria-label={t("Location")}
                  maxLength={200}
                  value={filters.location}
                  onChange={(event) => setFilters({ ...filters, location: event.target.value })}
                />
              </label>
              <label>
                {t("Level")}
                <select
                  className="text-input"
                  aria-label={t("Level")}
                  value={filters.level}
                  onChange={(event) => setFilters({ ...filters, level: event.target.value })}
                >
                  <option value="">{t("Any level")}</option>
                  {jobLevels.map((level) => (
                    <option key={level} value={level}>
                      {t(levelLabels[level])}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="button-row">
              <button className="button primary" type="submit">
                {t("Search published roles")}
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  setFilters({ q: "", track: "", workplace: "", location: "", level: "" });
                  setQuery(querySchema.parse({}));
                }}
              >
                {t("Reset filters")}
              </button>
            </div>
          </form>
          <CareerPathBrowser
            selected={query.specialization || "all"}
            counts={counts}
            countLabel="published"
            onSelect={apply}
          />
          <section className="section-block" aria-label={t("Published job results")}>
            {loading && <p role="status">{t("Loading published roles…")}</p>}
            {!loading && page && !page.data.length && (
              <div className="panel">
                <h2>{t("No published roles match these filters")}</h2>
                <p>
                  {t(
                    "Try broader filters. Career guides stay available even when a specialization has no published opening.",
                  )}
                </p>
              </div>
            )}
            <div className="catalog-results">
              {!loading &&
                page?.data.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    saved={saved.has(job.id)}
                    busy={busy}
                    onOpen={() => void open(job.id)}
                    onSave={() => save(job)}
                  />
                ))}
            </div>
            {!loading && page?.nextCursor && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void catalog
                    .list({ ...query, cursor: page.nextCursor! })
                    .then((next) => setPage({ ...next, data: [...page.data, ...next.data] }))
                    .catch(failed)
                    .finally(() => setBusy(false));
                }}
              >
                {t("Load more roles")}
              </button>
            )}
          </section>
        </>
      )}
      {selected && <JobDetails job={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
