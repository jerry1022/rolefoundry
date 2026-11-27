"use client";
import { localizedJobText, type jobLevels, type PublishedJob } from "@/modules/jobs/model";
import { msg, useI18n } from "@/lib/i18n";

/** Display labels for job levels; the English values remain the filter and API codes. */
export const levelLabels = {
  Intern: msg("Intern"),
  Entry: msg("Entry"),
  Mid: msg("Mid"),
  Senior: msg("Senior"),
  Lead: msg("Lead"),
} satisfies Record<(typeof jobLevels)[number], string>;
const intervalLabels = { hour: msg("hour"), month: msg("month"), year: msg("year") };
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
  const { t, fmt, locale } = useI18n();
  const text = localizedJobText(job, locale);
  const { salary } = job;
  const lower = salary?.min == null ? t("Unknown lower bound") : fmt.number(salary.min);
  const upper = salary?.max == null ? t("Unknown upper bound") : fmt.number(salary.max);
  return (
    <article className="panel catalog-job-card">
      <div className="catalog-card-heading">
        <div>
          <small>{job.company}</small>
          <h3>
            <button className="catalog-title" onClick={onOpen} lang={text.lang}>
              {text.title}
            </button>
          </h3>
        </div>
        <button
          className="button secondary"
          disabled={busy}
          aria-label={
            saved
              ? t("Unsave {title}", { title: text.title })
              : t("Save {title}", { title: text.title })
          }
          onClick={() => void onSave()}
        >
          {saved ? t("Saved") : t("Save role")}
        </button>
      </div>
      <div className="tags">
        <span className="skill-tag">
          {job.workplace ? t(job.workplace) : t("Workplace not specified")}
        </span>
        <span className="skill-tag">{job.location || t("Location not specified")}</span>
        <span className="skill-tag">
          {job.level ? t(levelLabels[job.level]) : t("Level not specified")}
        </span>
        {job.sources.some((source) => source.isDemo) && (
          <span className="pill">{t("Demonstration listing")}</span>
        )}
        {job.sources.some((source) => source.freshness === "uncertain") && (
          <span className="pill">{t("Freshness uncertain")}</span>
        )}
      </div>
      <p lang={text.lang}>{text.summary}</p>
      <p className="muted">
        {salary
          ? `${salary.currency} ${lower} – ${upper} / ${t(intervalLabels[salary.interval])}`
          : t("Salary undisclosed")}
      </p>
      <small>
        {job.sources.length === 1
          ? t("{count} permitted source · Requirements distinguish mandatory from preferred.", {
              count: job.sources.length,
            })
          : t("{count} permitted sources · Requirements distinguish mandatory from preferred.", {
              count: job.sources.length,
            })}
      </small>
    </article>
  );
}
