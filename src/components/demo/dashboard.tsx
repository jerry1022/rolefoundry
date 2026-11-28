"use client";
import { PageHeading } from "../ui/page-heading";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  BookOpen,
  BriefcaseBusiness,
  CheckCircle2,
  GraduationCap,
  Layers3,
  ShieldCheck,
  Sparkles,
  Sprout,
} from "lucide-react";
import { courses, jobs } from "@/lib/fixtures";
import { localizedDemoCourse, localizedDemoJob, searchableDemoJobs } from "@/lib/fixtures-locale";
import { matchJob, recommendCourses, searchJobs, skillLabels, type Job } from "@/lib/domain";
import { useWorkspace } from "@/lib/workspace";
import { useI18n } from "@/lib/i18n";
import { SectionHeading, JobDetails, JobCard } from "./shared";

export function Dashboard() {
  const { state } = useWorkspace();
  const { t, locale } = useI18n();
  const [selected, setSelected] = useState<Job | null>(null);
  const recommended = searchJobs(
    searchableDemoJobs,
    "",
    state.track,
    "Any workplace",
    state.knownSkills,
  ).slice(0, 3);
  const target = recommended[0];
  const gaps = target ? matchJob(target, state.knownSkills).missing : [];
  const nextCourse = localizedDemoCourse(
    recommendCourses(courses, gaps, state.knownSkills).find(
      (r) => !state.completedCourses.includes(r.course.id),
    )?.course || courses[1],
    locale,
  );
  return (
    <>
      <PageHeading
        eyebrow={t("YOUR CAREER, IN THE MAKING")}
        title={t("Good things ahead, {name}.", { name: state.name })}
        description={t("Find your direction. Build the skills. Make your next move.")}
        action={
          <Link href="/jobs/" className="button secondary">
            {t("Explore opportunities")}
            <ArrowUpRight size={16} />
          </Link>
        }
      />
      <section className="hero-panel">
        <div className="hero-content">
          <span className="hero-kicker">
            <span /> {t("FROM POTENTIAL TO POSSIBILITY")}
          </span>
          <h2>
            {t("Your next chapter")}
            <br />
            {t("starts with a little clarity.")}
          </h2>
          <p>
            {t("Discover AI roles that fit you, see where you can grow,")}
            <br className="desktop-br" /> {t("and turn your curiosity into a concrete next step.")}
          </p>
          <Link href="/assessments/" className="button dark">
            {t("Find my starting point")}
            <ArrowUpRight size={17} />
          </Link>
          <span className="hero-footnote">
            {t("A 3-question preview. No perfect answers required.")}
          </span>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-orbit-scene">
            <div className="hero-orbit-halo" />
            <div className="hero-orbit-ring ring-a" />
            <div className="hero-orbit-ring ring-b" />
            <div className="hero-orbit-ring ring-c" />
            <div className="hero-orbit-core">
              <Sprout size={68} strokeWidth={1.2} />
            </div>
            <span className="hero-orbit-satellite satellite-a">
              <Layers3 size={22} />
            </span>
            <span className="hero-orbit-satellite satellite-b">
              <BriefcaseBusiness size={22} />
            </span>
            <span className="hero-orbit-satellite satellite-c">
              <BookOpen size={22} />
            </span>
          </div>
          <div className="floating-label label-top">
            <CheckCircle2 size={15} />
            {t("A little more confidence")}
          </div>
          <div className="floating-label label-bottom">
            <Sparkles size={15} />
            {t("Skills with a direction")}
          </div>
          <div className="hero-art-caption">
            {t("YOUR NEXT ROLE")}
            <span>{t("Always a work in progress")}</span>
          </div>
        </div>
      </section>
      <section className="stats-grid" aria-label={t("Workspace statistics")}>
        {[
          {
            label: t("Roles to explore"),
            value: jobs.length.toString().padStart(2, "0"),
            note: t("Sample opportunities"),
            icon: BriefcaseBusiness,
            color: "mint",
          },
          {
            label: t("Skills in your toolkit"),
            value: state.knownSkills.length.toString().padStart(2, "0"),
            note: t("Self-reported · ready to validate"),
            icon: Layers3,
            color: "lilac",
          },
          {
            label: t("Saved possibilities"),
            value: state.savedJobs.length.toString().padStart(2, "0"),
            note: t("A shortlist worth exploring"),
            icon: Bookmark,
            color: "peach",
          },
          {
            label: t("Learning milestones"),
            value: state.completedCourses.length.toString().padStart(2, "0"),
            note: t("Progress, one step at a time"),
            icon: GraduationCap,
            color: "yellow",
          },
        ].map((stat) => (
          <article className="stat-card" key={stat.label}>
            <div className="stat-top">
              <span>{stat.label}</span>
              <span className={`stat-icon ${stat.color}`}>
                <stat.icon size={17} />
              </span>
            </div>
            <strong className="stat-number">{stat.value}</strong>
            <p>{stat.note}</p>
          </article>
        ))}
      </section>
      <section className="section-block">
        <SectionHeading
          title={t("A few possibilities for you")}
          subtitle={t("A starting point based on the skills in your profile.")}
          href="/jobs/"
          link={t("Explore all roles")}
        />
        <div className="job-grid">
          {recommended.map((job) => (
            <JobCard key={job.id} job={job} compact onOpen={setSelected} />
          ))}
        </div>
      </section>
      <div className="dashboard-bottom">
        <section className="panel growth-panel">
          <SectionHeading
            title={t("Your growth snapshot")}
            href="/skills/"
            link={t("View profile")}
          />
          <div className="growth-content">
            <div className="growth-ring">
              <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle cx="60" cy="60" r="49" />
                <circle
                  className="ring-value"
                  cx="60"
                  cy="60"
                  r="49"
                  strokeDasharray={`${(state.knownSkills.length / 9) * 308} 308`}
                />
              </svg>
              <div>
                <strong>
                  {state.knownSkills.length}
                  <span>/9</span>
                </strong>
                <small>{t("skills explored")}</small>
              </div>
            </div>
            <div className="growth-copy">
              <span className="mini-label">{t("ROOM TO GROW")}</span>
              <h3>{gaps.length ? t(skillLabels[gaps[0]]) : t("Add evidence to your skills")}</h3>
              <p>
                {gaps.length
                  ? t("A useful next step toward {role} roles.", {
                      role: localizedDemoJob(target, locale).title,
                    })
                  : t("Try a short scenario to make your skills more tangible.")}
              </p>
              <Link href="/assessments/" className="text-link">
                {t("Take a skill check")}
                <ArrowRight size={15} />
              </Link>
            </div>
          </div>
          <div className="panel-note">
            <ShieldCheck size={15} />
            {t("Self-reported skills are a starting point, not a certification.")}
          </div>
        </section>
        <section className="panel next-step-panel">
          <div className="next-step-top">
            <span className="course-icon">
              <BookOpen size={22} />
            </span>
            <span className="mini-label">{t("YOUR NEXT SMALL STEP")}</span>
            <span className="pill">{t("CURATED LEARNING")}</span>
          </div>
          <h3>{nextCourse.title}</h3>
          <p>{nextCourse.summary}</p>
          <div className="next-step-bottom">
            <span className="provider-dot">
              d<span>DeepLearning.AI</span>
            </span>
            <Link
              href="/learning/"
              className="round-button"
              aria-label={t("Explore your learning path")}
            >
              <ArrowUpRight size={20} />
            </Link>
          </div>
        </section>
      </div>
      {selected && <JobDetails job={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
