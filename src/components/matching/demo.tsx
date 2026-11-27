"use client";
import Link from "next/link";
import { PageHeading } from "../ui/page-heading";
import { useWorkspace } from "@/lib/workspace";
import { jobs } from "@/lib/fixtures";
import { matchJob } from "@/lib/domain";
export function DemoMatching() {
  const { state } = useWorkspace();
  const ranked = jobs
    .map((job) => ({ job, match: matchJob(job, state.knownSkills) }))
    .sort((a, b) => b.match.coverage - a.match.coverage || a.job.id.localeCompare(b.job.id));
  return (
    <>
      <PageHeading
        eyebrow="LOCAL DEMO · FICTIONAL ROLES"
        title="Explore skill overlap."
        description="This local preview compares selected skills with fictional role requirements. It is not private server matching or a hiring probability."
      />
      <div className="matching-results">
        {ranked.map(({ job, match }) => (
          <article className="panel" key={job.id}>
            <h2>{job.title}</h2>
            <p>{job.company} · Sample data</p>
            <p>
              {match.covered.length} / {job.skills.length} fixture skills selected.
            </p>
            <p className="muted">
              Missing from the selected list: {match.missing.join(", ") || "None"}. Missing evidence
              does not prove inability.
            </p>
          </article>
        ))}
      </div>
      <Link className="button secondary" href="/skills/">
        Edit local demo skills
      </Link>
    </>
  );
}
