"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { CourseClient } from "@/modules/learning/ports";
import type { CoursePage, CourseProgress, CourseQuery } from "@/modules/learning/model";
import type { SkillClient } from "@/modules/skills/ports";
import { skillLabel } from "@/modules/skills/model";
import { ApplicationError } from "@/modules/platform/errors";
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
  const [page, setPage] = useState<CoursePage | null>(null),
    [query, setQuery] = useState<CourseQuery>({}),
    [labels, setLabels] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [reload, setReload] = useState(0);
  function failed(error: unknown) {
    setError(
      error instanceof ApplicationError ? error.message : "The course catalog is unavailable.",
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
                .map((skill) => [skill.id, skill.nameEn]),
            ),
          );
      })
      .catch(() => {});
    return () => {
      present = false;
    };
  }, [skills, page?.dictionaryVersion]);
  return (
    <section className="section-block">
      <h2>Reviewed course resources</h2>
      <p className="muted">
        DeepLearning.AI is the initial curated provider. Course summaries, mappings and practice
        prompts are independent editorial metadata. Access and prices belong to the provider; check
        the official page.
      </p>
      <div className="learning-filter-row">
        <label>
          Skill
          <select
            aria-label="Course skill filter"
            className="text-input"
            value={query.skill || ""}
            onChange={(event) => setQuery({ ...query, skill: event.target.value || undefined })}
          >
            <option value="">All skills</option>
            {Object.entries(labels).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Difficulty
          <select
            aria-label="Course difficulty filter"
            className="text-input"
            value={query.difficulty || ""}
            onChange={(event) =>
              setQuery({
                ...query,
                difficulty: (event.target.value as CourseQuery["difficulty"]) || undefined,
              })
            }
          >
            <option value="">All levels</option>
            {["Beginner", "Intermediate", "Advanced", "Unknown"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <div className="notice" role="alert">
          <p>{error}</p>
          <button className="button secondary" onClick={() => setReload((value) => value + 1)}>
            Reload course catalog
          </button>
        </div>
      )}
      {loading && <p role="status">Loading course resources…</p>}
      {!loading && page && !page.data.length && (
        <p className="panel">
          No reviewed resources match these filters. This provider may not cover the topic; no
          course is invented to fill the list.
        </p>
      )}
      <div className="learning-course-grid">
        {page?.data.map((course) => {
          const completed =
            progress?.data.some((item) => item.courseId === course.id && item.completed) || false;
          return (
            <article className="panel learning-card" key={course.id}>
              <p className="mini-label">
                {course.providerName} · {course.format}
              </p>
              <h3>{course.title}</h3>
              {course.source.isDemo && (
                <p className="pill">Demonstration metadata · fictional offering</p>
              )}
              <p>{course.summary}</p>
              <p className="muted">
                {course.difficulty} · {course.language || "Language not supplied"} ·{" "}
                {course.officialMinutes !== null
                  ? `${course.officialMinutes} official minutes`
                  : course.editorialMinutes !== null
                    ? `${course.editorialMinutes} editorial estimated minutes`
                    : "Duration unknown; an estimate is needed for planning"}
              </p>
              <p className="pill">
                {course.availability === "available"
                  ? "Reviewed resource"
                  : course.availability === "uncertain"
                    ? "Availability or metadata needs confirmation"
                    : "Retired resource"}
              </p>
              <p className="muted">
                Last reviewed: {course.lastReviewedAt?.slice(0, 10) || "Not supplied"}.{" "}
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
                Prerequisite skills:{" "}
                {course.prerequisiteSkills.map((skill) => skillLabel(skill, labels)).join(", ") ||
                  "None listed"}
                . Required foundation resources: {course.prerequisiteCourseIds.length}.
              </p>
              <details>
                <summary>Practice outcome</summary>
                <p>{course.practice.prompt}</p>
                <p>{course.practice.completionCriteria}</p>
              </details>
              <div className="learning-actions">
                <a
                  className="button secondary"
                  href={course.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open official resource ↗
                </a>
                {progress ? (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => onProgress(course.id, !completed)}
                  >
                    {completed ? "Reported complete · undo" : "Report entire course complete"}
                  </button>
                ) : privateEnabled ? (
                  <Link className="text-link" href="/account/">
                    Sign in to save private progress
                  </Link>
                ) : (
                  <span className="muted">Private progress is not enabled here.</span>
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
          Load more course resources
        </button>
      )}
    </section>
  );
}
