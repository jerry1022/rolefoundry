import type {
  AIProvider,
  Course,
  CourseRepository,
  Evidence,
  Job,
  JobRepository,
  Question,
  Skill,
  Stage,
  Task,
  Track,
} from "./domain";
import { courses, jobs } from "./fixtures";

export class FixtureJobRepository implements JobRepository {
  async list() {
    return structuredClone(jobs);
  }
  async find(id: string) {
    return structuredClone(jobs.find((job) => job.id === id) || null);
  }
}
export class FixtureCourseRepository implements CourseRepository {
  async list() {
    return structuredClone(courses);
  }
}

// Domain ports. Identity has a Supabase implementation; other production ports remain contracts.
import type { Actor } from "../modules/identity/core";
export type { Actor } from "../modules/identity/core";
export interface IdentityService {
  authorize(actor: Actor, action: string, resourceOwnerId?: string): Promise<void>;
}
export interface ProfileService {
  addEvidence(actor: Actor, evidence: Evidence): Promise<Evidence>;
  setDirection(actor: Actor, track: Track): Promise<void>;
}
export interface SkillCatalogService {
  resolveAlias(input: string): Promise<Skill | null>;
  list(): Promise<{ id: Skill; label: string }[]>;
}
export interface AssessmentService {
  start(
    actor: Actor,
    track: Track,
  ): Promise<{ attemptId: string; questions: Omit<Question, "correct" | "explanation">[] }>;
  submit(actor: Actor, attemptId: string, answers: Record<string, number>): Promise<Task>;
}
export interface MatchingService {
  refresh(actor: Actor, jobId?: Job["id"]): Promise<Task>;
}
export interface LearningService {
  plan(actor: Actor, jobId: string, weeklyHours: number): Promise<Task>;
  markComplete(actor: Actor, courseId: Course["id"]): Promise<void>;
}
export interface ResumeService {
  parse(actor: Actor, fileId: string): Promise<Task>;
  revise(actor: Actor, resumeVersionId: string, jobId: string): Promise<Task>;
  export(actor: Actor, resumeVersionId: string): Promise<Task>;
}
export interface ApplicationService {
  track(actor: Actor, jobId: string): Promise<string>;
  move(actor: Actor, applicationId: string, stage: Stage): Promise<void>;
}
export interface IngestionService {
  import(
    actor: Actor,
    input: { sourceId: string; kind: "jobs" | "courses"; batchId: string },
  ): Promise<Task>;
}
export interface AIService {
  provider: AIProvider;
}
