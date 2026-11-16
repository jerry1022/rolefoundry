import { z } from "zod";
import { skillIdSchema } from "../skills/model";
import { matchSnapshotSchema } from "../matching/model";
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value));
export const resourceUrl = z
  .url()
  .max(2048)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port;
  })
  .transform((value) => new URL(value).href);
const skills = z
  .array(skillIdSchema)
  .max(20)
  .refine((value) => new Set(value).size === value.length);
const ids = z
  .array(z.uuid().transform((value) => value.toLowerCase()))
  .max(20)
  .refine((value) => new Set(value).size === value.length);
export const courseFields = [
  "title",
  "url",
  "provider",
  "summary",
  "skills",
  "prerequisites",
  "duration",
  "practice",
  "language",
  "difficulty",
  "format",
  "availability",
] as const;
export const courseSourceSchema = z
  .object({
    providerId: skillIdSchema,
    name: text(160),
    publisher: text(200),
    authorizationBasis: text(2000),
    rightsSummary: text(500),
    allowedHosts: z.array(text(253)).min(1).max(20),
    permittedFields: z
      .array(z.enum(courseFields))
      .length(12)
      .refine((value) => new Set(value).size === 12),
    isDemo: z.boolean(),
  })
  .strict();
export const courseDraftSchema = z
  .object({
    key: text(200),
    providerId: skillIdSchema,
    sourceId: z.uuid().transform((value) => value.toLowerCase()),
    title: text(200),
    url: resourceUrl,
    summary: text(2000),
    skills: skills.refine((value) => value.length > 0),
    prerequisiteSkills: skills,
    prerequisiteCourseIds: ids,
    language: text(60).nullable(),
    difficulty: z.enum(["Beginner", "Intermediate", "Advanced", "Unknown"]),
    format: text(60),
    officialMinutes: z.number().int().min(1).max(50000).nullable(),
    editorialMinutes: z.number().int().min(1).max(50000).nullable(),
    durationNote: text(1000),
    practice: z
      .object({
        prompt: text(1000),
        completionCriteria: text(1000),
        minutes: z.number().int().min(5).max(240),
      })
      .strict(),
  })
  .strict();
export type CourseDraft = z.infer<typeof courseDraftSchema>;
export const courseSchema = courseDraftSchema.omit({ key: true, sourceId: true }).extend({
  id: z.uuid(),
  versionId: z.uuid(),
  version: z.number().int().positive(),
  providerName: z.string(),
  revision: z.number().int().positive(),
  availability: z.enum(["available", "uncertain", "retired"]),
  lastReviewedAt: z.string().nullable(),
  dictionaryVersion: z.number().int().positive(),
  source: z.object({
    id: z.uuid(),
    name: z.string(),
    publisher: z.string(),
    rightsSummary: z.string(),
    isDemo: z.boolean(),
  }),
});
export type LearningCourse = z.infer<typeof courseSchema>;
export const coursePageSchema = z.object({
  data: z.array(courseSchema),
  nextCursor: z.string().nullable(),
  revision: z.number().int().nonnegative(),
  dictionaryVersion: z.number().int().positive(),
});
export type CoursePage = z.infer<typeof coursePageSchema>;
export const courseQuerySchema = z
  .object({
    skill: skillIdSchema.optional(),
    difficulty: z.enum(["Beginner", "Intermediate", "Advanced", "Unknown"]).optional(),
    cursor: z.string().min(1).max(512).optional(),
  })
  .strict();
export type CourseQuery = z.infer<typeof courseQuerySchema>;
export const planRequestSchema = z
  .object({
    jobId: z.uuid(),
    weeklyHours: z.number().min(0).max(80),
    durationOverrides: z
      .array(
        z
          .object({
            courseId: z.uuid().transform((value) => value.toLowerCase()),
            minutes: z.number().int().min(1).max(50000),
          })
          .strict(),
      )
      .max(100),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.durationOverrides.map((item) => item.courseId)).size ===
      value.durationOverrides.length,
  );
export type PlanRequest = z.infer<typeof planRequestSchema>;
export const learningSnapshotSchema = z
  .object({
    matching: matchSnapshotSchema,
    courseRevision: z.number().int().nonnegative(),
    progressRevision: z.number().int().nonnegative(),
    courses: z.array(courseSchema).max(200),
    completedCourseIds: z.array(z.uuid()),
    weeklyHours: z.number().min(0).max(80),
    durationOverrides: planRequestSchema.shape.durationOverrides,
  })
  .refine(
    (value) =>
      value.matching.jobs.length === 1 &&
      new Set(value.courses.map((course) => course.id)).size === value.courses.length &&
      value.durationOverrides.every((override) =>
        value.courses.some((course) => course.id === override.courseId),
      ),
  );
export type LearningSnapshot = z.infer<typeof learningSnapshotSchema>;
export const learningStepSchema = z
  .object({
    key: z.string().min(1).max(100),
    kind: z.enum(["course", "practice"]),
    courseId: z.uuid().nullable(),
    courseVersionId: z.uuid().nullable(),
    title: z.string(),
    skills: z.array(skillIdSchema),
    durationBasis: z.enum(["official", "editorial", "owner-estimate", "practice"]),
    studyMinutes: z.number().int().nonnegative(),
    practiceMinutes: z.number().int().nonnegative(),
    remainingMinutes: z.number().int().nonnegative(),
    scope: z.enum(["full-resource", "partial-resource", "practice-only"]),
    weeks: z.array(
      z.object({
        week: z.union([z.literal(1), z.literal(2)]),
        minutes: z.number().int().positive(),
      }),
    ),
    dependsOn: z.array(z.string()),
    practicePrompt: z.string(),
    completionCriteria: z.string(),
    notes: z.array(z.string()),
  })
  .strict();
export type LearningStep = z.infer<typeof learningStepSchema>;
export const learningOutputSchema = z
  .object({
    recipe: z.literal("learning-rules-v1"),
    matchingRecipe: z.literal("rules-v1"),
    budgetMinutes: z.number().int().nonnegative(),
    scheduledMinutes: z.number().int().nonnegative(),
    steps: z.array(learningStepSchema).max(40),
    issues: z.array(
      z.object({
        skillId: skillIdSchema.nullable(),
        kind: z.enum([
          "no-resource",
          "completed-needs-evidence",
          "blocked-prerequisite",
          "unknown-duration",
          "time-budget",
          "non-learning-gap",
        ]),
        reason: z.string(),
      }),
    ),
    limitations: z.array(z.string()),
  })
  .strict();
export type LearningOutput = z.infer<typeof learningOutputSchema>;
export interface LearningGapInput {
  recipe: "rules-v1";
  gaps: {
    skillId: string | null;
    kind: string;
    priority: "mandatory" | "preferred";
    reason: string;
  }[];
  supportedSkills: string[];
}
export const learningTaskSchema = z.object({
  planId: z.uuid(),
  taskId: z.uuid(),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
});
export const courseProgressSchema = z.object({
  revision: z.number().int().nonnegative(),
  data: z.array(
    z.object({
      courseId: z.uuid(),
      courseVersionId: z.uuid(),
      title: z.string(),
      completed: z.boolean(),
      updatedAt: z.string(),
    }),
  ),
});
export type CourseProgress = z.infer<typeof courseProgressSchema>;
export const planSchema = z.object({
  id: z.uuid(),
  taskId: z.uuid().nullable(),
  jobId: z.uuid(),
  status: z.enum(["queued", "running", "failed", "succeeded", "invalidated"]),
  createdAt: z.string(),
  stale: z.boolean(),
  progressRevision: z.number().int().nonnegative(),
  weeklyHours: z.number(),
  output: learningOutputSchema.nullable(),
  steps: z.array(
    learningStepSchema.extend({
      id: z.uuid(),
      completed: z.boolean(),
      available: z.boolean(),
      url: resourceUrl.nullable(),
    }),
  ),
  practiceSubmissions: z.array(
    z.object({
      id: z.uuid(),
      stepId: z.uuid().nullable(),
      url: resourceUrl,
      summary: z.string(),
      createdAt: z.string(),
    }),
  ),
  nextCursor: z.string().nullable(),
});
export type LearningPlan = z.infer<typeof planSchema>;
export const planHistorySchema = z.object({
  data: z.array(
    z.object({
      id: z.uuid(),
      jobId: z.uuid(),
      status: z.enum(["queued", "running", "failed", "succeeded", "invalidated"]),
      createdAt: z.string(),
    }),
  ),
  nextCursor: z.string().nullable(),
});
export const courseBankSchema = z.object({
  providers: z.array(
    z.object({
      id: skillIdSchema,
      name: z.string(),
      allowedHosts: z.array(z.string()),
      pathPrefixes: z.array(z.string()),
      urlIdentity: z.enum(["path", "origin-path"]),
    }),
  ),
  sources: z.array(
    z.object({
      id: z.uuid(),
      providerId: skillIdSchema,
      name: z.string(),
      status: z.enum(["active", "revoked"]),
      authorizationBasis: z.string(),
      rightsSummary: z.string(),
    }),
  ),
  courses: z.array(
    courseDraftSchema.extend({
      id: z.uuid(),
      version: z.number().int().positive(),
      revision: z.number().int().positive(),
      stage: z.enum(["draft", "review", "published"]),
      retired: z.boolean(),
      publishedVersion: z.number().int().positive().nullable(),
    }),
  ),
});
