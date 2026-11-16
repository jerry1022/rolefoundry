import { describe, it, expect } from "vitest";
import { planLearning } from "../../src/modules/learning/planner";
import {
  learningOutputSchema,
  courseDraftSchema,
  type LearningCourse,
  type LearningSnapshot,
  type LearningGapInput,
} from "../../src/modules/learning/model";
function course(overrides: Partial<LearningCourse> = {}): LearningCourse {
  return {
    id: crypto.randomUUID(),
    versionId: crypto.randomUUID(),
    version: 1,
    revision: 1,
    providerId: "deeplearning-ai",
    providerName: "DeepLearning.AI",
    title: "Fictional learning fixture",
    url: "https://www.deeplearning.ai/courses/fictional-local-fixture/",
    summary: "Authored fixture metadata",
    skills: ["rag"],
    prerequisiteSkills: [],
    prerequisiteCourseIds: [],
    language: "en",
    difficulty: "Beginner",
    format: "Course",
    officialMinutes: 45,
    editorialMinutes: null,
    durationNote: "Fictional reviewed duration for tests",
    practice: {
      prompt: "Build an example and note limits",
      completionCriteria: "Keep an example and a test",
      minutes: 15,
    },
    availability: "available",
    lastReviewedAt: new Date().toISOString(),
    dictionaryVersion: 1,
    source: {
      id: crypto.randomUUID(),
      name: "Fixture source",
      publisher: "Fixture publisher",
      rightsSummary: "Not a real course",
      isDemo: true,
    },
    ...overrides,
  };
}
function input(
  courses: LearningCourse[],
  overrides: Partial<LearningSnapshot> = {},
): LearningSnapshot {
  return {
    matching: {
      profileRevision: 0,
      catalogRevision: 0,
      dictionaryVersion: 1,
      track: "Engineering & data",
      workplaces: [],
      constraints: { experienceYears: null, confirmations: [] },
      evidence: [],
      jobs: [
        {
          id: crypto.randomUUID(),
          versionId: crypto.randomUUID(),
          title: "Target fixture",
          company: "Fixture",
          track: "Engineering & data",
          workplace: null,
          level: null,
          requirements: [{ text: "RAG workflow", priority: "mandatory", skills: ["rag"] }],
          conditions: { workAuthorization: null, education: null, experienceYears: null },
        },
      ],
    },
    courseRevision: 0,
    progressRevision: 0,
    courses,
    completedCourseIds: [],
    weeklyHours: 1,
    durationOverrides: [],
    ...overrides,
  };
}
const gaps: LearningGapInput = {
  recipe: "rules-v1",
  gaps: [
    {
      skillId: "rag",
      kind: "missing-evidence",
      priority: "mandatory",
      reason: "No linked support",
    },
  ],
  supportedSkills: [],
};
describe("two-week learning rules", () => {
  it("orders missing foundations before dependent resources and stays inside each week's budget", () => {
    const foundation = course({ skills: ["python"] }),
      target = course({ prerequisiteSkills: ["python"], prerequisiteCourseIds: [foundation.id] });
    const result = planLearning(input([target, foundation]), gaps);
    expect(result.steps.map((step) => step.courseId)).toEqual([foundation.id, target.id]);
    expect(result.steps[1].dependsOn).toEqual([`course:${foundation.id}`]);
    expect(result.scheduledMinutes).toBe(120);
    for (const week of [1, 2])
      expect(
        result.steps
          .flatMap((step) => step.weeks)
          .filter((part) => part.week === week)
          .reduce((sum, part) => sum + part.minutes, 0),
      ).toBeLessThanOrEqual(60);
    expect(learningOutputSchema.safeParse(result).success).toBe(true);
  });
  it("does not duplicate one course that addresses several gaps or count completion as ability", () => {
    const resource = course({ skills: ["rag", "evaluation"] });
    const result = planLearning(input([resource]), {
      ...gaps,
      gaps: [
        ...gaps.gaps,
        {
          skillId: "evaluation",
          kind: "missing-evidence",
          priority: "preferred",
          reason: "No evidence",
        },
      ],
    });
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].notes.join(" ")).toContain("not verified ability");
    const completed = planLearning(input([resource], { completedCourseIds: [resource.id] }), gaps);
    expect(completed.steps.every((step) => step.courseId === null)).toBe(true);
    expect(completed.issues.some((issue) => issue.kind === "completed-needs-evidence")).toBe(true);
  });
  it("uses partial study explicitly for a small budget and schedules nothing at zero hours", () => {
    const resource = course({ officialMinutes: 300 });
    const result = planLearning(input([resource], { weeklyHours: 0.5 }), gaps);
    expect(result.scheduledMinutes).toBe(60);
    expect(result.steps[0]).toMatchObject({
      scope: "partial-resource",
      studyMinutes: 60,
      remainingMinutes: 255,
    });
    expect(result.steps[0].completionCriteria).toContain("does not mean course completion");
    const zero = planLearning(input([resource], { weeklyHours: 0 }), gaps);
    expect(zero.steps).toEqual([]);
    expect(zero.scheduledMinutes).toBe(0);
    expect(zero.issues.some((issue) => issue.kind === "time-budget")).toBe(true);
  });
  it("never invents a course for unsupported or unavailable skills", () => {
    for (const courses of [
      [],
      [course({ availability: "uncertain" })],
      [course({ availability: "retired" })],
    ]) {
      const result = planLearning(input(courses), gaps);
      expect(result.steps.every((step) => step.courseId === null)).toBe(true);
      expect(result.issues.some((issue) => issue.kind === "no-resource")).toBe(true);
    }
  });
  it("blocks cyclic or missing prerequisites instead of ordering them as satisfied", () => {
    const a = course(),
      b = course({ skills: ["python"], prerequisiteCourseIds: [a.id] });
    a.prerequisiteCourseIds = [b.id];
    const result = planLearning(input([a, b]), gaps);
    expect(result.steps).toEqual([]);
    expect(result.issues.some((issue) => issue.kind === "blocked-prerequisite")).toBe(true);
    const missing = planLearning(
      input([course({ prerequisiteCourseIds: [crypto.randomUUID()] })]),
      gaps,
    );
    expect(missing.steps).toEqual([]);
  });
  it("labels editorial/owner estimates and withholds resources with unknown durations", () => {
    const unknown = course({ officialMinutes: null, editorialMinutes: null });
    expect(
      planLearning(input([unknown]), gaps).issues.some(
        (issue) => issue.kind === "unknown-duration",
      ),
    ).toBe(true);
    const editorial = course({ officialMinutes: null, editorialMinutes: 30 });
    expect(planLearning(input([editorial]), gaps).steps[0].durationBasis).toBe("editorial");
    expect(
      planLearning(
        input([unknown], { durationOverrides: [{ courseId: unknown.id, minutes: 30 }] }),
        gaps,
      ).steps[0].durationBasis,
    ).toBe("owner-estimate");
  });
  it("keeps condition/experience gaps outside course claims and requires safe resource URLs", () => {
    const result = planLearning(input([course()]), {
      recipe: "rules-v1",
      supportedSkills: [],
      gaps: [
        {
          skillId: null,
          kind: "longer-term-experience",
          priority: "mandatory",
          reason: "Years are below the listed minimum",
        },
      ],
    });
    expect(result.steps).toEqual([]);
    expect(result.issues[0].kind).toBe("non-learning-gap");
    const {
      id,
      versionId,
      version,
      revision,
      providerName,
      availability,
      lastReviewedAt,
      dictionaryVersion,
      source,
      ...metadata
    } = course();
    const draft = { ...metadata, key: "fixture", sourceId: source.id };
    expect(courseDraftSchema.safeParse(draft).success).toBe(true);
    const canonicalId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    expect(
      courseDraftSchema.safeParse({
        ...draft,
        prerequisiteCourseIds: [canonicalId, canonicalId.toUpperCase()],
      }).success,
    ).toBe(false);
    expect(courseDraftSchema.safeParse({ ...draft, url: "http://127.0.0.1/private" }).success).toBe(
      false,
    );
  });
});

describe("private learning contracts", () => {
  it("authorizes before requesting a persisted plan", async () => {
    const { LearningService } = await import("../../src/modules/learning/service");
    const { vi } = await import("vitest");
    const repository = {
      start: vi.fn(),
      find: vi.fn(),
      list: vi.fn(),
      progress: vi.fn(),
      courseProgress: vi.fn(),
      stepProgress: vi.fn(),
      practice: vi.fn(),
      removePractice: vi.fn(),
    };
    const service = new LearningService(repository, {
      authorize: async () => {
        throw Error("Denied");
      },
    });
    await expect(
      service.plan(
        { userId: crypto.randomUUID(), role: "member" },
        { jobId: crypto.randomUUID(), weeklyHours: 1, durationOverrides: [] },
        crypto.randomUUID(),
      ),
    ).rejects.toThrow("Denied");
    expect(repository.start).not.toHaveBeenCalled();
  });
  it("uses injected gap/store ports and stops before publication after cancellation", async () => {
    const { LearningHandler } = await import("../../src/modules/learning/handler");
    const { vi } = await import("vitest");
    const controller = new AbortController();
    const store = { load: vi.fn(async () => input([course()])), publish: vi.fn(async () => {}) };
    const lease = {
      taskId: crypto.randomUUID(),
      token: crypto.randomUUID(),
      messageId: "1",
      kind: "learning.plan" as const,
      leaseSeconds: 5,
    };
    await new LearningHandler(store, { analyze: async () => gaps }).execute(
      lease,
      controller.signal,
    );
    expect(store.publish).toHaveBeenCalledWith(
      lease,
      expect.objectContaining({ recipe: "learning-rules-v1" }),
      controller.signal,
    );
    store.publish.mockClear();
    await expect(
      new LearningHandler(store, {
        analyze: () => {
          controller.abort();
          return gaps;
        },
      }).execute(lease, controller.signal),
    ).rejects.toMatchObject({ category: "canceled" });
    expect(store.publish).not.toHaveBeenCalled();
  });
  it("does not resurrect removed plan content or overwrite newer independent practice/progress", async () => {
    const { planSchema } = await import("../../src/modules/learning/model");
    const { acceptLearningRead } = await import("../../src/modules/learning/plan-state");
    const complete = planSchema.parse({
      id: crypto.randomUUID(),
      taskId: crypto.randomUUID(),
      jobId: crypto.randomUUID(),
      status: "succeeded",
      createdAt: new Date().toISOString(),
      stale: false,
      progressRevision: 2,
      weeklyHours: 1,
      output: planLearning(input([course()]), gaps),
      steps: [],
      practiceSubmissions: [
        {
          id: crypto.randomUUID(),
          stepId: null,
          url: "https://example.org/my-practice",
          summary: "Independent reference",
          createdAt: new Date().toISOString(),
        },
      ],
      nextCursor: null,
    });
    const removed = {
      ...complete,
      status: "invalidated" as const,
      stale: true,
      output: null,
      steps: [],
    };
    expect(acceptLearningRead(removed, complete)).toEqual(removed);
    expect(
      acceptLearningRead(complete, { ...complete, progressRevision: 1, practiceSubmissions: [] }),
    ).toEqual(complete);
    expect(
      acceptLearningRead(removed, { ...removed, progressRevision: 3, practiceSubmissions: [] })
        .practiceSubmissions,
    ).toEqual([]);
    expect(acceptLearningRead({ ...complete, stale: true }, complete).stale).toBe(true);
  });
});
