"use client";
import Link from "next/link";
import { PageHeading } from "../ui/page-heading";
import { useWorkspace } from "@/lib/workspace";
import { jobs } from "@/lib/fixtures";
import { matchJob } from "@/lib/domain";
import { useI18n } from "@/lib/i18n";
export function DemoMatching() {
  const { t } = useI18n();
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
      <div className="matching-results">
        {ranked.map(({ job, match }) => (
          <article className="panel" key={job.id}>
            <h2>{job.title}</h2>
            <p>{t("{company} · Sample data", { company: job.company })}</p>
            <p>
              {t("{covered} / {total} fixture skills selected.", {
                covered: match.covered.length,
                total: job.skills.length,
              })}
            </p>
            <p className="muted">
              {t(
                "Missing from the selected list: {skills}. Missing evidence does not prove inability.",
                {
                  skills: match.missing.join(", ") || t("None"),
                },
              )}
            </p>
          </article>
        ))}
      </div>
      <Link className="button secondary" href="/skills/">
        {t("Edit local demo skills")}
      </Link>
    </>
  );
}
