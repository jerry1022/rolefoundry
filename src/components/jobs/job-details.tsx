"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import type { PublishedJob } from "@/modules/jobs/model";
import { labelsForLocale, skillLabel } from "@/modules/skills/model";
import { useI18n } from "@/lib/i18n";
export function JobDetails({ job, onClose }: { job: PublishedJob; onClose: () => void }) {
  const { t, locale } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="catalog-dialog"
      aria-labelledby="catalog-job-title"
      onCancel={onClose}
    >
      <div className="catalog-dialog-top">
        <small>{job.company}</small>
        <button className="button secondary" onClick={onClose} aria-label={t("Close job details")}>
          {t("Close")}
        </button>
      </div>
      <h2 id="catalog-job-title">{job.title}</h2>
      <p>{job.summary}</p>
      <Link className="button primary" href={`/matches/?job=${job.id}`}>
        {t("Compare with my evidence")}
      </Link>
      <Link className="button secondary" href={`/learning/?job=${job.id}`}>
        {t("Plan learning for this role")}
      </Link>
      <Link className="button secondary" href={`/resume/?job=${job.id}`}>
        {t("Review resume for this role")}
      </Link>
      <Link className="button secondary" href={`/applications/?job=${job.id}`}>
        {t("Prepare a tracking record")}
      </Link>
      <h3>{t("Responsibilities")}</h3>
      <ul>
        {job.responsibilities.map((text, index) => (
          <li key={index}>{text}</li>
        ))}
      </ul>
      <h3>{t("Requirements")}</h3>
      {job.requirements.map((requirement, index) => (
        <section key={index}>
          <strong>{requirement.priority === "mandatory" ? t("Mandatory") : t("Preferred")}</strong>
          <p>{requirement.text}</p>
          <div className="tags">
            {requirement.skills.map((skill) => (
              <span key={skill} className="skill-tag">
                {skillLabel(
                  skill,
                  labelsForLocale(locale, {
                    en: requirement.skillLabels,
                    zhTw: requirement.skillLabelsZhTw,
                  }),
                )}
              </span>
            ))}
          </div>
        </section>
      ))}
      <h3>{t("Conditions")}</h3>
      <dl>
        <dt>{t("Work authorization")}</dt>
        <dd>{job.conditions.workAuthorization || t("Unknown / not supplied")}</dd>
        <dt>{t("Education")}</dt>
        <dd>{job.conditions.education || t("Unknown / not supplied")}</dd>
        <dt>{t("Experience")}</dt>
        <dd>
          {job.conditions.experienceYears === null
            ? t("Unknown / not supplied")
            : t("{years} years stated by the source", { years: job.conditions.experienceYears })}
        </dd>
      </dl>
      <h3>{t("Sources and freshness")}</h3>
      {job.sources.map((source) => (
        <section key={source.id}>
          <strong>
            {source.publisher} · {source.name}
          </strong>
          {source.isDemo && <p className="pill">{t("Demonstration listing; fictional data")}</p>}
          <p>{source.rightsSummary}</p>
          <p className="muted">
            {source.freshness === "uncertain"
              ? t("The latest check failed; availability is uncertain.")
              : t("Last observed as active; check the original source before applying.")}{" "}
            {source.lastValidatedAt
              ? t("Last successful validation: {date}.", {
                  date: source.lastValidatedAt.slice(0, 10),
                })
              : t("Last successful validation: Not yet independently validated.")}
          </p>
          <a className="text-link" href={source.url} target="_blank" rel="noopener noreferrer">
            {t("Visit original source ↗")}
          </a>
        </section>
      ))}
      <p className="muted">
        {t(
          "Opening a link or saving this role does not submit an application. No hiring probability is implied. Job version {version}.",
          { version: job.version },
        )}
      </p>
    </dialog>
  );
}
