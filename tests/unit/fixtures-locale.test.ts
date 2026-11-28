import { describe, expect, it } from "vitest";
import { courses, jobs, questions } from "../../src/lib/fixtures";
import { coursesZhTw, jobsZhTw, questionsZhTw } from "../../src/lib/fixtures-zh-tw";
import {
  localizedDemoCourse,
  localizedDemoJob,
  localizedDemoQuestion,
  searchableDemoJobs,
} from "../../src/lib/fixtures-locale";
import { searchJobs } from "../../src/lib/domain";
import { careerPaths } from "../../src/lib/career-paths";
import { careerPathsZhTw, localizedCareerPath } from "../../src/lib/career-paths-zh-tw";

const cjk = /[㐀-鿿]/;

describe("zh-TW demo fixture text", () => {
  it("covers every fixture with aligned lists and Chinese text", () => {
    expect(Object.keys(jobsZhTw).sort()).toEqual(jobs.map((job) => job.id).sort());
    expect(Object.keys(coursesZhTw).sort()).toEqual(courses.map((course) => course.id).sort());
    expect(Object.keys(questionsZhTw).sort()).toEqual(questions.map((q) => q.id).sort());
    for (const job of jobs) {
      const text = jobsZhTw[job.id];
      expect(text.responsibilities).toHaveLength(job.responsibilities.length);
      for (const value of [text.title, text.summary, ...text.responsibilities])
        expect(value).toMatch(cjk);
    }
    for (const question of questions) {
      const text = questionsZhTw[question.id];
      expect(text.options).toHaveLength(question.options.length);
      expect(new Set(text.options).size).toBe(text.options.length);
    }
  });

  it("localizes only for zh-TW and never changes identity, skills or answer keys", () => {
    const job = localizedDemoJob(jobs[0], "zh-TW");
    expect(job).toMatchObject({ id: jobs[0].id, skills: jobs[0].skills, lang: "zh-Hant" });
    expect(job.title).toMatch(cjk);
    expect(localizedDemoJob(jobs[0], "en")).toMatchObject({ title: jobs[0].title, lang: "en" });
    const course = localizedDemoCourse(courses[0], "zh-TW");
    expect(course.title).toBe(courses[0].title);
    expect(course.summary).toMatch(cjk);
    const question = localizedDemoQuestion(questions[0], "zh-TW");
    expect(question.correct).toBe(questions[0].correct);
  });

  it("finds demo roles by English or Chinese terms", () => {
    const search = (query: string) =>
      searchJobs(searchableDemoJobs, query, "All tracks", "Any workplace", []).map((j) => j.id);
    expect(search("Growth Analyst")).toContain("rf-08");
    expect(search("成長分析師")).toContain("rf-08");
  });

  it("covers every career-path guide with aligned Chinese text", () => {
    for (const path of careerPaths) {
      const text = careerPathsZhTw[path.id];
      expect(text.learning).toHaveLength(path.learning.length);
      expect(text.evidence).toHaveLength(path.evidence.length);
      for (const value of [text.work, text.project, ...text.evidence]) expect(value).toMatch(cjk);
      expect(localizedCareerPath(path, "zh-TW").lang).toBe("zh-Hant");
      expect(localizedCareerPath(path, "en").work).toBe(path.work);
    }
  });
});

describe("Japanese editorial fixtures", () => {
  it("covers every demo role, course, question and career path with aligned lists", () => {
    for (const job of jobs) {
      const localized = localizedDemoJob(job, "ja");
      expect(localized.lang).toBe("ja");
      expect(localized.responsibilities).toHaveLength(job.responsibilities.length);
      expect(localized.title).not.toBe(job.title);
    }
    for (const course of courses) {
      const localized = localizedDemoCourse(course, "ja");
      expect(localized.lang).toBe("ja");
      expect(localized.title).toBe(course.title);
      expect(localized.summary).not.toBe(course.summary);
    }
    for (const question of questions) {
      const localized = localizedDemoQuestion(question, "ja");
      expect(localized.lang).toBe("ja");
      expect(localized.options).toHaveLength(question.options.length);
      expect(localized.correct).toBe(question.correct);
    }
    for (const path of careerPaths) {
      const localized = localizedCareerPath(path, "ja");
      expect(localized.lang).toBe("ja");
      expect(localized.learning).toHaveLength(path.learning.length);
      expect(localized.evidence).toHaveLength(path.evidence.length);
    }
  });
});
