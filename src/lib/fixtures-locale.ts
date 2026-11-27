import type { Course, Job, Question } from "./domain";
import type { Locale } from "./i18n";
import { coursesZhTw, jobsZhTw, questionsZhTw } from "./fixtures-zh-tw";
import { jobs } from "./fixtures";

/**
 * Demo fixture text for the viewer's locale. Each helper returns the fixture with its text
 * fields replaced, so screens keep using one object; missing or misaligned text falls back to
 * English and `lang` tells the UI which language it renders.
 */
export function localizedDemoJob(job: Job, locale: Locale): Job & { lang: "en" | "zh-Hant" } {
  const text = locale === "zh-TW" ? jobsZhTw[job.id] : undefined;
  if (!text || text.responsibilities.length !== job.responsibilities.length)
    return { ...job, lang: "en" };
  return { ...job, ...text, lang: "zh-Hant" };
}

export function localizedDemoCourse(
  course: Course,
  locale: Locale,
): Course & { lang: "en" | "zh-Hant" } {
  const text = locale === "zh-TW" ? coursesZhTw[course.id] : undefined;
  return text ? { ...course, ...text, lang: "zh-Hant" } : { ...course, lang: "en" };
}

export function localizedDemoQuestion(
  question: Question,
  locale: Locale,
): Question & { lang: "en" | "zh-Hant" } {
  const text = locale === "zh-TW" ? questionsZhTw[question.id] : undefined;
  if (!text || text.options.length !== question.options.length) return { ...question, lang: "en" };
  return { ...question, ...text, lang: "zh-Hant" };
}

/** Demo jobs searchable in either language, whatever the viewer's locale. */
export const searchableDemoJobs: Job[] = jobs.map((job) => {
  const text = jobsZhTw[job.id];
  return text ? { ...job, searchAliases: [text.title, text.summary] } : job;
});
