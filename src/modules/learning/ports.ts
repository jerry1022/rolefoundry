import type { Actor } from "../identity/core";
import type { TaskLease } from "../tasks/model";
import type { MatchSnapshot } from "../matching/model";
import type { z } from "zod";
import type {
  CourseQuery,
  CoursePage,
  LearningCourse,
  PlanRequest,
  LearningPlan,
  LearningSnapshot,
  LearningOutput,
  LearningGapInput,
  CourseProgress,
  CourseTranslationInput,
  CourseTranslationRemoval,
  courseSourceSchema,
  courseDraftSchema,
  courseBankSchema,
  planHistorySchema,
  learningTaskSchema,
} from "./model";
export interface CourseCatalog {
  list(query: CourseQuery): Promise<CoursePage>;
  find(id: string): Promise<LearningCourse>;
}
export interface LearningRepository {
  start(input: PlanRequest, key: string): Promise<z.infer<typeof learningTaskSchema>>;
  find(id: string): Promise<LearningPlan>;
  list(cursor?: string): Promise<z.infer<typeof planHistorySchema>>;
  progress(): Promise<CourseProgress>;
  courseProgress(
    courseId: string,
    expectedRevision: number,
    completed: boolean,
  ): Promise<CourseProgress>;
  stepProgress(
    planId: string,
    stepId: string,
    expectedRevision: number,
    completed: boolean,
  ): Promise<LearningPlan>;
  removePractice(
    planId: string,
    submissionId: string,
    expectedRevision: number,
  ): Promise<LearningPlan>;
  practice(
    planId: string,
    stepId: string,
    input: { expectedRevision: number; url: string; summary: string },
  ): Promise<LearningPlan>;
}
export interface LearningAdministration {
  bank(): Promise<z.infer<typeof courseBankSchema>>;
  source(input: z.infer<typeof courseSourceSchema>): Promise<{ id: string }>;
  sourceStatus(id: string, status: "active" | "revoked", reason: string): Promise<void>;
  create(input: z.infer<typeof courseDraftSchema>): Promise<{ id: string; revision: number }>;
  revise(
    id: string,
    input: z.infer<typeof courseDraftSchema>,
    expectedRevision: number,
  ): Promise<{ id: string; revision: number }>;
  transition(
    id: string,
    input: {
      expectedRevision: number;
      action: "review" | "publish" | "retire" | "confirmed_active" | "network_failure";
      reason: string;
    },
  ): Promise<void>;
  translate(id: string, input: CourseTranslationInput): Promise<void>;
  removeTranslation(id: string, input: CourseTranslationRemoval): Promise<void>;
}
export interface LearningAuthorization {
  authorize(actor: Actor, action: string, ownerId?: string): Promise<void>;
}
export interface LearningExecutionStore {
  load(lease: TaskLease, signal: AbortSignal): Promise<LearningSnapshot>;
  publish(lease: TaskLease, output: LearningOutput, signal: AbortSignal): Promise<void>;
}
export interface LearningGapAnalyzer {
  analyze(input: MatchSnapshot, signal: AbortSignal): LearningGapInput | Promise<LearningGapInput>;
}
export interface LearningClient extends LearningRepository {}
export interface CourseClient extends CourseCatalog {}
export interface LearningAdminClient extends LearningAdministration {}
