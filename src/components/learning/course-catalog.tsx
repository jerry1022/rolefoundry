"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { CourseClient } from "@/modules/learning/ports";
import type { CoursePage, CourseProgress, CourseQuery } from "@/modules/learning/model";
import type { SkillClient } from "@/modules/skills/ports";
import { localizedSkillName, skillLabel } from "@/modules/skills/model";
import { localizedCourseText } from "@/modules/learning/model";
import { ApplicationError } from "@/modules/platform/errors";
import { msg, useI18n } from "@/lib/i18n";
const difficulties = [msg("Beginner"), msg("Intermediate"), msg("Advanced"), msg("Unknown")];
export function CourseCatalog({
  client,
  skills,
  progress,
  busy,
  onProgress,
  version,
  privateEnabled,
}: {
  client: CourseClient;
  skills: SkillClient;
  progress: CourseProgress | null;
  busy: boolean;
  onProgress: (id: string, complete: boolean) => void;
  version: number;
  privateEnabled: boolean;
}) {
  const { t, locale } = useI18n();
  const [page, setPage] = useState<CoursePage | null>(null),
    [query, setQuery] = useState<CourseQuery>({}),
    [labels, setLabels] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [reload, setReload] = useState(0);
  function failed(error: unknown) {
    setError(
      error instanceof ApplicationError ? error.message : t("The course catalog is unavailable."),
    );
  }
  useEffect(() => {
    let present = true;
    setLoading(true);
    setError("");
    void client
      .list(query)
      .then((value) => {
        if (present) setPage(value);
      })
      .catch((error) => {
        if (present) failed(error);
      })
      .finally(() => {
        if (present) setLoading(false);
      });
    return () => {
      present = false;
    };
  }, [client, query, reload, version]);
  useEffect(() => {
    let present = true;
    void skills
      .get(page?.dictionaryVersion)
      .then((dictionary) => {
        if (present)
          setLabels(
            Object.fromEntries(
              dictionary.skills
                .filter((skill) => skill.status === "active")
                .map((skill) => [skill.id, localizedSkillName(skill, locale)]),
            ),
          );
      })
      .catch(() => {});
    return () => {
      present = false;
    };
  }, [skills, page?.dictionaryVersion, locale]);
  return (
    <section className="section-block">
      <h2>{t("Reviewed course resources")}</h2>
      <p className="muted">
        {t(
          "DeepLearning.AI is the initial curated provider. Course summaries, mappings and practice prompts are independent editorial metadata. Access and prices belong to the provider; check the official page.",
        )}
      </p>
      <div className="learning-filter-row">
        <label>
          {t("Skill")}
          <select
            aria-label={t("Course skill filter")}
            className="text-input"
            value={query.skill || ""}
            onChange={(event) => setQuery({ ...query, skill: event.target.value || undefined })}
          >
            <option value="">{t("All skills")}</option>
            {Object.entries(labels).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Difficulty")}
          <select
            aria-label={t("Course difficulty filter")}
            className="text-input"
            value={query.difficulty || ""}
            onChange={(event) =>
              setQuery({
                ...query,
                difficulty: (event.target.value as CourseQuery["difficulty"]) || undefined,
              })
            }
          >
            <option value="">{t("All levels")}</option>
            {difficulties.map((value) => (
              <option key={value} value={value}>
                {t(value)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <div className="notice" role="alert">
          <p>{t(error)}</p>
          <button className="button secondary" onClick={() => setReload((value) => value + 1)}>
            {t("Reload course catalog")}
          </button>
        </div>
      )}
      {loading && <p role="status">{t("Loading course resources…")}</p>}
      {!loading && page && !page.data.length && (
        <p className="panel">
          {t(
            "No reviewed resources match these filters. This provider may not cover the topic; no course is invented to fill the list.",
          )}
        </p>
      )}
      <div className="learning-course-grid">
        {page?.data.map((course) => {
          const completed =
            progress?.data.some((item) => item.courseId === course.id && item.completed) || false;
          const text = localizedCourseText(course, locale);
          return (
            <article className="panel learning-card" key={course.id}>
              <p className="mini-label">
                {course.providerName} · {course.format}
              </p>
              <h3>{course.title}</h3>
              {course.source.isDemo && (
                <p className="pill">{t("Demonstration metadata · fictional offering")}</p>
              )}
              <p lang={text.lang}>{text.summary}</p>
              <p className="muted">
                {t(course.difficulty)} · {course.language || t("Language not supplied")} ·{" "}
                {course.officialMinutes !== null
                  ? t("{n} official minutes", { n: course.officialMinutes })
                  : course.editorialMinutes !== null
                    ? t("{n} editorial estimated minutes", { n: course.editorialMinutes })
                    : t("Duration unknown; an estimate is needed for planning")}
              </p>
              <p className="pill">
                {course.availability === "available"
                  ? t("Reviewed resource")
                  : course.availability === "uncertain"
                    ? t("Availability or metadata needs confirmation")
                    : t("Retired resource")}
              </p>
              <p className="muted">
                {t("Last reviewed: {date}.", {
                  date: course.lastReviewedAt?.slice(0, 10) || t("Not supplied"),
                })}{" "}
                {course.durationNote}
              </p>
              <div className="tags">
                {course.skills.map((skill) => (
                  <span className="skill-tag" key={skill}>
                    {skillLabel(skill, labels)}
                  </span>
                ))}
              </div>
              <p>
                {t("Prerequisite skills: {skills}. Required foundation resources: {count}.", {
                  skills:
                    course.prerequisiteSkills
                      .map((skill) => skillLabel(skill, labels))
                      .join(", ") || t("None listed"),
                  count: course.prerequisiteCourseIds.length,
                })}
              </p>
              <details>
                <summary>{t("Practice outcome")}</summary>
                <p lang={text.lang}>{text.practicePrompt}</p>
                <p lang={text.lang}>{text.completionCriteria}</p>
                {text.reviewedAt && (
                  <p className="muted">
                    {t("Reviewed translation of RoleFoundry's editorial notes.")}
                  </p>
                )}
              </details>
              <div className="learning-actions">
                <a
                  className="button secondary"
                  href={course.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("Open official resource ↗")}
                </a>
                {progress ? (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => onProgress(course.id, !completed)}
                  >
                    {completed ? t("Reported complete · undo") : t("Report entire course complete")}
                  </button>
                ) : privateEnabled ? (
                  <Link className="text-link" href="/account/">
                    {t("Sign in to save private progress")}
                  </Link>
                ) : (
                  <span className="muted">{t("Private progress is not enabled here.")}</span>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {page?.nextCursor && (
        <button
          className="button secondary"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            void client
              .list({ ...query, cursor: page.nextCursor! })
              .then((next) => setPage({ ...next, data: [...page.data, ...next.data] }))
              .catch(failed)
              .finally(() => setLoading(false));
          }}
        >
          {t("Load more course resources")}
        </button>
      )}
    </section>
  );
}
