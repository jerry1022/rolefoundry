import { describe, expect, it } from "vitest";
import {
  gradeAssessment,
  initialWorkspace,
  matchJob,
  recommendCourses,
  searchJobs,
  workspaceSchema,
} from "../../src/lib/domain";
import { courses, jobs, questions } from "../../src/lib/fixtures";
import { FixtureJobRepository } from "../../src/lib/services";

describe("job discovery and evidence boundaries", () => {
  it("combines keywords, track and workplace without returning unrelated roles", () => {
    expect(
      searchJobs(jobs, "python", "Engineering & data", "Remote", ["python"]).map((j) => j.id),
    ).toEqual(["rf-02"]);
    expect(searchJobs(jobs, "nonexistent", "All tracks", "Any workplace", [])).toEqual([]);
  });
  it("treats missing skills as a gap rather than a hiring probability", () => {
    const result = matchJob(jobs[0], ["python", "prompting"]);
    expect(result.covered).toEqual(["python", "prompting"]);
    expect(result.missing).toEqual(["rag", "evaluation"]);
    expect(result.coverage).toBe(50);
  });
  it("does not duplicate coverage for duplicated self-reported inputs", () => {
    expect(matchJob(jobs[0], ["python", "python"]).coverage).toBe(25);
  });
  it("does not expose mutable fixture references through repositories", async () => {
    const repo = new FixtureJobRepository();
    const first = await repo.list();
    first[0].title = "changed";
    expect((await repo.find("rf-01"))?.title).toBe("AI Application Engineer");
    expect(await repo.find("missing")).toBeNull();
  });
});
describe("learning recommendations", () => {
  it("returns resources only for requested gaps, prioritizing achievable prerequisites", () => {
    const ranked = recommendCourses(courses, ["agents", "evaluation"], ["python", "prompting"]);
    expect(ranked[0].course.id).toBe("dl-agent");
    expect(ranked.every((r) => r.addresses.length > 0)).toBe(true);
    expect(recommendCourses(courses, [], [])).toEqual([]);
  });
  it("marks missing prerequisites explicitly", () => {
    expect(recommendCourses(courses, ["rag"], [])[0].prerequisitesMissing).toEqual([
      "python",
      "prompting",
    ]);
  });
});
describe("scenario scoring and browser persistence", () => {
  it("grades all four tracks with fixed answers and explanations", () => {
    expect(questions).toHaveLength(12);
    for (const track of new Set(questions.map((q) => q.track))) {
      const items = questions.filter((q) => q.track === track);
      const correct = Object.fromEntries(items.map((q) => [q.id, q.correct]));
      expect(gradeAssessment(items, correct).correct).toBe(items.length);
      expect(gradeAssessment(items, {}).correct).toBe(0);
      expect(items.every((q) => q.explanation.length > 20)).toBe(true);
    }
  });
  it("rejects invalid saved workspace data and supports the current version", () => {
    expect(workspaceSchema.safeParse(initialWorkspace).success).toBe(true);
    expect(workspaceSchema.safeParse({ ...initialWorkspace, version: 2 }).success).toBe(false);
    expect(
      workspaceSchema.safeParse({ ...initialWorkspace, track: "made-up", resume: 42 }).success,
    ).toBe(false);
  });
  it("keeps course completion separate from ability evidence", () => {
    const state = workspaceSchema.parse({ ...initialWorkspace, completedCourses: [courses[0].id] });
    expect(state.evidence).toEqual([]);
    expect(state.knownSkills).toEqual(initialWorkspace.knownSkills);
  });
});
