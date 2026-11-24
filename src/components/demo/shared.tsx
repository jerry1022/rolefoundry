"use client";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight, Bookmark, Check, MapPin, Plus, X } from "lucide-react";
import { localizedDemoJob } from "@/lib/fixtures-locale";
import { matchJob, skillLabels, type Job, type Skill } from "@/lib/domain";
import { useWorkspace } from "@/lib/workspace";
import { msg, useI18n } from "@/lib/i18n";
import { getCareerPath } from "@/lib/career-paths";

/** Gap recommendations show the best few; "All resources" lists the full catalog. */
export const recommendationLimit = 6;

export const workplaceOptions = [
  msg("Any workplace"),
  msg("Remote"),
  msg("Hybrid"),
  msg("On-site"),
];

/** Fixture salaries are authored as "NT$90k–140k / month"; re-render them per locale. */
export function formatSalary(value: string, fmt: ReturnType<typeof useI18n>["fmt"]) {
  const match = /^NT\$(\d+)k–(\d+)k \/ month$/.exec(value);
  return match ? fmt.monthlyRange(Number(match[1]) * 1000, Number(match[2]) * 1000) : value;
}

/** Localized, locale-joined skill names ("Python and SQL"). */
export function useSkillNames() {
  const { t, fmt } = useI18n();
  return (skills: readonly Skill[]) => fmt.list(skills.map((skill) => t(skillLabels[skill])));
}

export function SectionHeading({
  title,
  subtitle,
  href,
  link,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  link?: string;
}) {
  const { t } = useI18n();
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {href && (
        <Link className="text-link" href={href}>
          {link || t("View all")}
          <ArrowRight size={16} />
        </Link>
      )}
    </div>
  );
}

export function SkillTag({ skill, known }: { skill: Skill; known?: boolean }) {
  const { t } = useI18n();
  return (
    <span className={`skill-tag ${known ? "known" : ""}`}>
      {known && <Check size={11} />}
      {t(skillLabels[skill])}
    </span>
  );
}

export function Modal({
  children,
  title,
  onClose,
}: {
  children: ReactNode;
  title: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={ref} className="modal" onCancel={onClose} aria-label={title}>
      <button className="icon-button modal-close" aria-label={t("Close details")} onClick={onClose}>
        <X size={20} />
      </button>
      {children}
    </dialog>
  );
}

export function JobDetails({ job: source, onClose }: { job: Job; onClose: () => void }) {
  const { state, update } = useWorkspace();
  const { t, locale } = useI18n();
  const job = localizedDemoJob(source, locale);
  const skillNames = useSkillNames();
  const match = matchJob(job, state.knownSkills);
  const tracked = state.applications.some((a) => a.jobId === job.id);
  return (
    <Modal title={job.title} onClose={onClose}>
      <div className={`company-logo ${job.color}`}>{job.initials}</div>
      <p className="eyebrow modal-eyebrow">
        {job.company} · {t("ILLUSTRATIVE OPENING")}
      </p>
      <h2 className="modal-title" lang={job.lang}>
        {job.title}
      </h2>
      <p className="muted">
        {t(job.location)} · {t(job.mode)} · {t(job.level)}
      </p>
      <p className="job-specialization">{t(getCareerPath(job.specialization).title)}</p>
      <p className="detail-summary" lang={job.lang}>
        {job.summary}
      </p>
      <h3>{t("What you would work on")}</h3>
      <ul className="detail-list">
        {job.responsibilities.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <h3>{t("Your starting point")}</h3>
      <div className="tags">
        {job.skills.map((s) => (
          <SkillTag key={s} skill={s} known={state.knownSkills.includes(s)} />
        ))}
      </div>
      <div className="notice">
        <strong>{t("{n}% skill overlap", { n: match.coverage })}</strong>
        <p>
          {t("Based on your self-reported skills, not hiring probability.")}{" "}
          {match.missing.length
            ? t("Explore {skills} next.", {
                skills: skillNames(match.missing),
              })
            : t("Add scenario evidence to strengthen your profile.")}
        </p>
      </div>
      <div className="button-row">
        <button
          className="button primary"
          onClick={() =>
            update((s) => ({
              ...s,
              applications: tracked
                ? s.applications
                : [...s.applications, { jobId: job.id, stage: "Saved", note: "" }],
            }))
          }
        >
          {tracked ? <Check size={16} /> : <Plus size={16} />}
          {tracked ? t("In your tracker") : t("Add to tracker")}
        </button>
        <Link href="/learning/" className="button secondary" onClick={onClose}>
          {t("Find learning resources")}
          <ArrowUpRight size={16} />
        </Link>
      </div>
      <p className="fine-print">
        {t(
          "This company, opening and salary are sample data. No application is sent. Live job sources are part of the production roadmap.",
        )}
      </p>
    </Modal>
  );
}

export function JobCard({
  job,
  compact = false,
  onOpen,
}: {
  job: Job;
  compact?: boolean;
  onOpen: (job: Job) => void;
}) {
  const { state, update } = useWorkspace();
  const { t, fmt, locale } = useI18n();
  const text = localizedDemoJob(job, locale);
  const saved = state.savedJobs.includes(job.id);
  const match = matchJob(job, state.knownSkills);
  return (
    <article className={`job-card ${compact ? "compact" : ""}`}>
      <div className="job-card-top">
        <div className={`company-logo ${job.color}`}>{job.initials}</div>
        <span className="job-company">
          {job.company}
          <small>{t(job.added)}</small>
        </span>
        <button
          className={`icon-button bookmark ${saved ? "saved" : ""}`}
          aria-label={
            saved
              ? t("Unsave {title}", { title: text.title })
              : t("Save {title}", { title: text.title })
          }
          aria-pressed={saved}
          onClick={() =>
            update((s) => ({
              ...s,
              savedJobs: saved
                ? s.savedJobs.filter((id) => id !== job.id)
                : [...s.savedJobs, job.id],
            }))
          }
        >
          <Bookmark size={19} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
      <button className="job-title-button" onClick={() => onOpen(job)}>
        <h3 lang={text.lang}>{text.title}</h3>
      </button>
      {!compact && (
        <p className="job-specialization">{t(getCareerPath(job.specialization).title)}</p>
      )}
      <p className="job-location">
        <MapPin size={13} />
        {t(job.location)}
        <span>·</span>
        {t(job.mode)}
      </p>
      {!compact && (
        <p className="job-summary" lang={text.lang}>
          {text.summary}
        </p>
      )}
      <div className="tags">
        {job.skills.slice(0, 3).map((skill) => (
          <SkillTag skill={skill} key={skill} known={state.knownSkills.includes(skill)} />
        ))}
      </div>
      <div className="job-card-bottom">
        <span>{compact ? t(job.level) : formatSalary(job.salary, fmt)}</span>
        <button className="match-label" onClick={() => onOpen(job)}>
          <span className="status-dot" />
          {t("{n}% overlap", { n: match.coverage })}
          <ArrowUpRight size={13} />
        </button>
      </div>
    </article>
  );
}
