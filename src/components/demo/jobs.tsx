"use client";
import { PageHeading } from "../ui/page-heading";
import { useState } from "react";
import {
  Bookmark,
  Filter,
  MapPin,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { jobs } from "@/lib/fixtures";
import { searchableDemoJobs } from "@/lib/fixtures-locale";
import { searchJobs, tracks, type Job } from "@/lib/domain";
import { useWorkspace } from "@/lib/workspace";
import { useI18n } from "@/lib/i18n";
import { careerPaths, type CareerPathId } from "@/lib/career-paths";
import { CareerPathBrowser } from "../career-path-browser";
import { workplaceOptions, JobDetails, JobCard } from "./shared";

export function JobsScreen() {
  const { state } = useWorkspace();
  const { t, fmt } = useI18n();
  const [query, setQuery] = useState("");
  const [track, setTrack] = useState("All tracks");
  const [mode, setMode] = useState("Any workplace");
  const [specialization, setSpecialization] = useState<CareerPathId | "all">("all");
  const [savedOnly, setSavedOnly] = useState(false);
  const [selected, setSelected] = useState<Job | null>(null);
  const candidates = searchJobs(searchableDemoJobs, query, track, mode, state.knownSkills).filter(
    (job) => !savedOnly || state.savedJobs.includes(job.id),
  );
  const results = searchJobs(
    searchableDemoJobs,
    query,
    track,
    mode,
    state.knownSkills,
    specialization,
  ).filter((job) => !savedOnly || state.savedJobs.includes(job.id));
  const counts = Object.fromEntries(
    careerPaths.map((path) => [
      path.id,
      candidates.filter((job) => job.specialization === path.id).length,
    ]),
  ) as Record<CareerPathId, number>;
  return (
    <>
      <PageHeading
        eyebrow={t("POSSIBILITY LOOKS GOOD ON YOU")}
        title={t("Find your kind of next.")}
        description={t(
          "Explore AI roles at the intersection of what you know and where you want to go.",
        )}
      />
      <div className="notice inline">
        <Sparkles size={17} />
        <span>
          <strong>{t("Explore the demo.")}</strong>{" "}
          {t(
            "All employers, openings and salaries are fictional. Your saved roles stay in this browser.",
          )}
        </span>
      </div>
      <div className="search-panel">
        <div className="search-input">
          <Search size={19} />
          <input
            aria-label={t("Search jobs")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Role, company, or a skill you're curious about")}
          />
          {query && (
            <button
              aria-label={t("Clear search")}
              className="icon-button"
              onClick={() => setQuery("")}
            >
              <X size={16} />
            </button>
          )}
        </div>
        <div className="filter-row">
          <label>
            <Filter size={15} />
            <select
              aria-label={t("Career track")}
              value={track}
              onChange={(e) => setTrack(e.target.value)}
            >
              <option value="All tracks">{t("All tracks")}</option>
              {tracks.map((track) => (
                <option key={track} value={track}>
                  {t(track)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <MapPin size={15} />
            <select
              aria-label={t("Workplace")}
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              {workplaceOptions.map((m) => (
                <option key={m} value={m}>
                  {t(m)}
                </option>
              ))}
            </select>
          </label>
          <button
            className={`filter-button ${savedOnly ? "selected" : ""}`}
            aria-pressed={savedOnly}
            onClick={() => setSavedOnly(!savedOnly)}
          >
            <Bookmark size={15} />
            {t("Saved only")}
          </button>
          <button
            className="text-link reset-filters"
            onClick={() => {
              setQuery("");
              setTrack("All tracks");
              setMode("Any workplace");
              setSavedOnly(false);
              setSpecialization("all");
            }}
          >
            <RotateCcw size={13} />
            {t("Reset")}
          </button>
        </div>
      </div>
      <CareerPathBrowser selected={specialization} counts={counts} onSelect={setSpecialization} />
      <div className="results-heading">
        <span>
          <strong>{results.length}</strong> {t("possibilities to explore")}
        </span>
        <span>
          <SlidersHorizontal size={14} />
          {t("Sorted by skill overlap")}
        </span>
      </div>
      <div className="job-grid results-grid">
        {results.map((job) => (
          <JobCard key={job.id} job={job} onOpen={setSelected} />
        ))}
      </div>
      {!results.length && (
        <div className="empty-state">
          <Search size={30} />
          <h2>{t("No roles in this corner yet.")}</h2>
          <p>
            {specialization !== "all"
              ? t(
                  "No sample roles match this specialization and your current filters. Its career guide stays available above; try All specializations or reset your filters.",
                )
              : t("Try another keyword, workplace, or career track.")}
          </p>
        </div>
      )}
      {selected && <JobDetails job={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
