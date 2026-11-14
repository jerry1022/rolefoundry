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
import { JobCard } from "./job-card";
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
      error instanceof ApplicationError ? error.message : "Unable to load the catalog. Try again.",
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
    else setError("Check the search fields and try again.");
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
          ? "Saved role removed."
          : "Role saved privately to your account. No application was sent.",
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
        eyebrow="PUBLISHED ROLES · TRACEABLE SOURCES"
        title="Find your kind of next."
        description="Browse published AI roles without an account. Sources and unknown requirements stay visible; this catalog does not claim complete market coverage."
      />
      <div className="button-row">
        <button
          className={`button ${tab === "catalog" ? "primary" : "secondary"}`}
          onClick={() => setTab("catalog")}
        >
          Browse roles
        </button>
        <button
          className={`button ${tab === "saved" ? "primary" : "secondary"}`}
          onClick={() => setTab("saved")}
        >
          My saved roles
        </button>
      </div>
      {error && (
        <div className="notice section-block" role="alert">
          <p>{error}</p>
          {login && (
            <Link className="button secondary" href="/account/">
              Sign in to save roles
            </Link>
          )}
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => setQuery({ ...query, cursor: undefined })}
          >
            Reload catalog
          </button>
        </div>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
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
              Search jobs
              <input
                className="text-input"
                aria-label="Search jobs"
                maxLength={200}
                placeholder="Title, company, skills or specialization"
                value={filters.q}
                onChange={(event) => setFilters({ ...filters, q: event.target.value })}
              />
            </label>
            <div className="catalog-filter-grid">
              <label>
                Career track
                <select
                  className="text-input"
                  aria-label="Career track"
                  value={filters.track}
                  onChange={(event) => setFilters({ ...filters, track: event.target.value })}
                >
                  <option value="">All tracks</option>
                  {tracks.map((track) => (
                    <option key={track}>{track}</option>
                  ))}
                </select>
              </label>
              <label>
                Workplace
                <select
                  className="text-input"
                  aria-label="Workplace"
                  value={filters.workplace}
                  onChange={(event) => setFilters({ ...filters, workplace: event.target.value })}
                >
                  <option value="">Any workplace</option>
                  {workplaces.map((mode) => (
                    <option key={mode}>{mode}</option>
                  ))}
                </select>
              </label>
              <label>
                Location
                <input
                  className="text-input"
                  aria-label="Location"
                  maxLength={200}
                  value={filters.location}
                  onChange={(event) => setFilters({ ...filters, location: event.target.value })}
                />
              </label>
              <label>
                Level
                <select
                  className="text-input"
                  aria-label="Level"
                  value={filters.level}
                  onChange={(event) => setFilters({ ...filters, level: event.target.value })}
                >
                  <option value="">Any level</option>
                  {jobLevels.map((level) => (
                    <option key={level}>{level}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="button-row">
              <button className="button primary" type="submit">
                Search published roles
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  setFilters({ q: "", track: "", workplace: "", location: "", level: "" });
                  setQuery(querySchema.parse({}));
                }}
              >
                Reset filters
              </button>
            </div>
          </form>
          <CareerPathBrowser
            selected={query.specialization || "all"}
            counts={counts}
            countLabel="published"
            onSelect={apply}
          />
          <section className="section-block" aria-label="Published job results">
            {loading && <p role="status">Loading published roles…</p>}
            {!loading && page && !page.data.length && (
              <div className="panel">
                <h2>No published roles match these filters</h2>
                <p>
                  Try broader filters. Career guides stay available even when a specialization has
                  no published opening.
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
                Load more roles
              </button>
            )}
          </section>
        </>
      )}
      {selected && <JobDetails job={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
