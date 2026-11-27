"use client";
import { PageHeading } from "../ui/page-heading";
import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  Code2,
  ExternalLink,
  GraduationCap,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { courses, jobs } from "@/lib/fixtures";
import { localizedDemoCourse, localizedDemoJob } from "@/lib/fixtures-locale";
import { matchJob, recommendCourses } from "@/lib/domain";
import { useWorkspace } from "@/lib/workspace";
import { useI18n } from "@/lib/i18n";
import { recommendationLimit, useSkillNames, SkillTag } from "./shared";

export function LearningScreen() {
  const { state, update } = useWorkspace();
  const { t, fmt, locale } = useI18n();
  const skillNames = useSkillNames();
  const [targetId, setTargetId] = useState(jobs[0].id);
  const [showAll, setShowAll] = useState(false);
  const target = jobs.find((j) => j.id === targetId)!;
  const gaps = matchJob(target, state.knownSkills).missing;
  const recommended = recommendCourses(courses, gaps, state.knownSkills);
  const display = showAll
    ? courses.map((course) => ({
        course,
        addresses: course.skills.filter((s) => gaps.includes(s)),
        prerequisitesMissing: course.prerequisites.filter((s) => !state.knownSkills.includes(s)),
      }))
    : recommended.slice(0, recommendationLimit);
  return (
    <>
      <PageHeading
        eyebrow={t("LEARN WITH A LITTLE MORE DIRECTION")}
        title={t("Less wandering. More becoming.")}
        description={t(
          "Connect a role you want with the skills and practice that can help you get there.",
        )}
      />
      <section className="learning-hero">
        <div>
          <span className="hero-kicker">{t("A PATH, NOT AN ENDLESS PLAYLIST")}</span>
          <h2>
            {t("Start with the role.")}
            <br />
            {t("Work back to your next step.")}
          </h2>
          <p>
            {t("Curated DeepLearning.AI resources, paired with something you can actually build.")}
          </p>
        </div>
        <GraduationCap size={104} strokeWidth={1.1} />
      </section>
      <div className="learning-controls">
        <label className="field-label">
          {t("I'm exploring")}
          <select
            className="text-input"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          >
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {localizedDemoJob(j, locale).title}
              </option>
            ))}
          </select>
        </label>
        <div className="segmented">
          <button className={!showAll ? "selected" : ""} onClick={() => setShowAll(false)}>
            {t("For my skill gaps")}
          </button>
          <button className={showAll ? "selected" : ""} onClick={() => setShowAll(true)}>
            {t("All resources")}
          </button>
        </div>
      </div>
      <div className="gap-strip">
        <span className="mini-label">{t("YOUR NEXT FOCUS")}</span>
        {gaps.length ? (
          gaps.map((s) => <SkillTag key={s} skill={s} />)
        ) : (
          <span>{t("No missing self-reported skills. Add evidence through practice.")}</span>
        )}
      </div>
      <div className="course-grid">
        {display.map(({ course: source, addresses, prerequisitesMissing }, i) => {
          const course = localizedDemoCourse(source, locale);
          const done = state.completedCourses.includes(course.id);
          return (
            <article className="course-card" key={course.id}>
              <div className="course-card-top">
                <span className="course-number">{String(i + 1).padStart(2, "0")}</span>
                <span className="pill">{t(course.level)}</span>
                <span className="course-format">{t(course.format)}</span>
              </div>
              <span className="provider-dot">
                d<span>{course.provider}</span>
              </span>
              <h2>{course.title}</h2>
              <p lang={course.lang}>{course.summary}</p>
              <small className="course-reviewed">
                {t("Catalog details checked {date}", { date: fmt.date(course.reviewedAt) })}
              </small>
              <div className="tags">
                {course.skills.map((s) => (
                  <SkillTag key={s} skill={s} />
                ))}
              </div>
              <div className="course-reason">
                <Sparkles size={14} />
                <span>
                  {addresses.length
                    ? t("Why this: builds {skills}.", {
                        skills: skillNames(addresses),
                      })
                    : t("A foundation resource to explore.")}
                  {prerequisitesMissing.length > 0 &&
                    " " +
                      t("Start with {skills}.", {
                        skills: skillNames(prerequisitesMissing),
                      })}
                </span>
              </div>
              <div className="exercise">
                <strong>
                  <Code2 size={15} />
                  {t("MAKE IT TANGIBLE")}
                </strong>
                <p lang={course.lang}>{course.exercise}</p>
              </div>
              <div className="course-actions">
                <a className="text-link" href={course.url} target="_blank" rel="noreferrer">
                  {t("View official course")}
                  <ExternalLink size={14} />
                </a>
                <button
                  className={`completion-button ${done ? "done" : ""}`}
                  aria-pressed={done}
                  onClick={() =>
                    update((s) => ({
                      ...s,
                      completedCourses: done
                        ? s.completedCourses.filter((id) => id !== course.id)
                        : [...s.completedCourses, course.id],
                    }))
                  }
                >
                  {done ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                  {done ? t("Completed") : t("Mark complete")}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {!showAll && recommended.length > recommendationLimit && (
        <p className="muted section-block">
          {t("Showing the {shown} best matches of {total}.", {
            shown: recommendationLimit,
            total: recommended.length,
          })}{" "}
          <button className="text-link" onClick={() => setShowAll(true)}>
            {t("Browse all resources")}
          </button>
        </p>
      )}
      {!display.length && (
        <div className="empty-state">
          <CheckCircle2 size={30} />
          <h2>{t("No course gaps from your self-report.")}</h2>
          <p>{t("Explore all resources or validate your skills with a scenario check.")}</p>
          <button className="button secondary" onClick={() => setShowAll(true)}>
            {t("Browse all resources")}
          </button>
        </div>
      )}
      <div className="notice inline section-block">
        <ShieldCheck size={19} />
        <span>
          {t(
            "Independent editorial recommendations. Not affiliated with DeepLearning.AI. Availability and pricing are set by the provider. Completion is self-reported and does not verify ability.",
          )}
        </span>
      </div>
    </>
  );
}
