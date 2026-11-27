"use client";
import Link from "next/link";
import { PageHeading } from "../ui/page-heading";
import { SkillTag, useSkillNames } from "../demo/shared";
import { useWorkspace } from "@/lib/workspace";
import { jobs } from "@/lib/fixtures";
import { localizedDemoJob } from "@/lib/fixtures-locale";
import { matchJob } from "@/lib/domain";
import { useI18n } from "@/lib/i18n";

export function DemoMatching() {
  const { t, locale } = useI18n();
  const skillNames = useSkillNames();
  const { state } = useWorkspace();
  const ranked = jobs
    .map((job) => ({ job, match: matchJob(job, state.knownSkills) }))
    .sort((a, b) => b.match.coverage - a.match.coverage || a.job.id.localeCompare(b.job.id));
  return (
    <>
      <PageHeading
        eyebrow={t("LOCAL DEMO · FICTIONAL ROLES")}
        title={t("Explore skill overlap.")}
        description={t(
          "This local preview compares selected skills with fictional role requirements. It is not private server matching or a hiring probability.",
        )}
      />
      <div className="matching-results demo-overlap">
        {ranked.map(({ job, match }) => {
          const text = localizedDemoJob(job, locale);
          return (
            <article className="panel overlap-card" key={job.id}>
              <header>
                <div>
                  <h2 lang={text.lang}>{text.title}</h2>
                  <p className="muted">{t("{company} · Sample data", { company: job.company })}</p>
                </div>
                <strong className="overlap-figure">
                  {match.coverage}
                  <small>%</small>
                </strong>
              </header>
              {/* The figure and sentence carry the value; the bar is decorative. */}
              <div className="overlap-bar" aria-hidden="true">
                <span style={{ width: `${match.coverage}%` }} />
              </div>
              <p>
                {t("{covered} / {total} fixture skills selected.", {
                  covered: match.covered.length,
                  total: job.skills.length,
                })}
              </p>
              <div className="tags">
                {job.skills.map((skill) => (
                  <SkillTag key={skill} skill={skill} known={match.covered.includes(skill)} />
                ))}
              </div>
              <p className="muted">
                {t(
                  "Missing from the selected list: {skills}. Missing evidence does not prove inability.",
                  { skills: match.missing.length ? skillNames(match.missing) : t("None") },
                )}
              </p>
            </article>
          );
        })}
      </div>
      <Link className="button secondary" href="/skills/">
        {t("Edit local demo skills")}
      </Link>
    </>
  );
}
