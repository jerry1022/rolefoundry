"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import type { PublishedJob } from "@/modules/jobs/model";
import { skillLabel } from "@/modules/skills/model";
export function JobDetails({ job, onClose }: { job: PublishedJob; onClose: () => void }) {
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
        <button className="button secondary" onClick={onClose} aria-label="Close job details">
          Close
        </button>
      </div>
      <h2 id="catalog-job-title">{job.title}</h2>
      <p>{job.summary}</p>
      <Link className="button primary" href={`/matches/?job=${job.id}`}>
        Compare with my evidence
      </Link>
      <Link className="button secondary" href={`/learning/?job=${job.id}`}>
        Plan learning for this role
      </Link>
      <Link className="button secondary" href={`/resume/?job=${job.id}`}>
        Review resume for this role
      </Link>
      <h3>Responsibilities</h3>
      <ul>
        {job.responsibilities.map((text, index) => (
          <li key={index}>{text}</li>
        ))}
      </ul>
      <h3>Requirements</h3>
      {job.requirements.map((requirement, index) => (
        <section key={index}>
          <strong>{requirement.priority === "mandatory" ? "Mandatory" : "Preferred"}</strong>
          <p>{requirement.text}</p>
          <div className="tags">
            {requirement.skills.map((skill) => (
              <span key={skill} className="skill-tag">
                {skillLabel(skill, requirement.skillLabels)}
              </span>
            ))}
          </div>
        </section>
      ))}
      <h3>Conditions</h3>
      <dl>
        <dt>Work authorization</dt>
        <dd>{job.conditions.workAuthorization || "Unknown / not supplied"}</dd>
        <dt>Education</dt>
        <dd>{job.conditions.education || "Unknown / not supplied"}</dd>
        <dt>Experience</dt>
        <dd>
          {job.conditions.experienceYears === null
            ? "Unknown / not supplied"
            : `${job.conditions.experienceYears} years stated by the source`}
        </dd>
      </dl>
      <h3>Sources and freshness</h3>
      {job.sources.map((source) => (
        <section key={source.id}>
          <strong>
            {source.publisher} · {source.name}
          </strong>
          {source.isDemo && <p className="pill">Demonstration listing; fictional data</p>}
          <p>{source.rightsSummary}</p>
          <p className="muted">
            {source.freshness === "uncertain"
              ? "The latest check failed; availability is uncertain."
              : "Last observed as active; check the original source before applying."}{" "}
            Last successful validation:{" "}
            {source.lastValidatedAt?.slice(0, 10) || "Not yet independently validated"}.
          </p>
          <a className="text-link" href={source.url} target="_blank" rel="noopener noreferrer">
            Visit original source ↗
          </a>
        </section>
      ))}
      <p className="muted">
        Opening a link or saving this role does not submit an application. No hiring probability is
        implied. Job version {job.version}.
      </p>
    </dialog>
  );
}
