"use client";
import type { PublishedJob } from "@/modules/jobs/model";
export function JobCard({
  job,
  saved,
  busy,
  onOpen,
  onSave,
}: {
  job: PublishedJob;
  saved: boolean;
  busy: boolean;
  onOpen: () => void;
  onSave: () => Promise<void>;
}) {
  return (
    <article className="panel catalog-job-card">
      <div className="catalog-card-heading">
        <div>
          <small>{job.company}</small>
          <h3>
            <button className="catalog-title" onClick={onOpen}>
              {job.title}
            </button>
          </h3>
        </div>
        <button
          className="button secondary"
          disabled={busy}
          aria-label={`${saved ? "Unsave" : "Save"} ${job.title}`}
          onClick={() => void onSave()}
        >
          {saved ? "Saved" : "Save role"}
        </button>
      </div>
      <div className="tags">
        <span className="skill-tag">{job.workplace || "Workplace not specified"}</span>
        <span className="skill-tag">{job.location || "Location not specified"}</span>
        <span className="skill-tag">{job.level || "Level not specified"}</span>
        {job.sources.some((source) => source.isDemo) && (
          <span className="pill">Demonstration listing</span>
        )}
        {job.sources.some((source) => source.freshness === "uncertain") && (
          <span className="pill">Freshness uncertain</span>
        )}
      </div>
      <p>{job.summary}</p>
      <p className="muted">
        {job.salary
          ? `${job.salary.currency} ${job.salary.min?.toLocaleString() || "Unknown lower bound"} – ${job.salary.max?.toLocaleString() || "Unknown upper bound"} / ${job.salary.interval}`
          : "Salary undisclosed"}
      </p>
      <small>
        {job.sources.length} permitted source{job.sources.length === 1 ? "" : "s"} · Requirements
        distinguish mandatory from preferred.
      </small>
    </article>
  );
}
