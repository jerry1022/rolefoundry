import type { AIProvider, CourseRepository, Job, JobRepository, Stage, Task } from "./domain";
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

// Compatibility exports for implemented modules; remaining domain ports are still contracts.
import type { Actor } from "../modules/identity/core";
export type { Actor } from "../modules/identity/core";
export interface IdentityService {
  authorize(actor: Actor, action: string, resourceOwnerId?: string): Promise<void>;
}
export type { ProfileService } from "../modules/profile/service";
export type { ProfileRepository, InternalEvidenceWriter } from "../modules/profile/ports";
export type { SkillDictionaryService as SkillCatalogService } from "../modules/skills/service";
export type { SkillRepository, SkillAdminRepository } from "../modules/skills/ports";
export type { JobCatalogService } from "../modules/jobs/service";
export type { AssessmentService } from "../modules/assessment/service";
export type { AssessmentRepository, AssessmentClient } from "../modules/assessment/ports";
export type { MatchingService } from "../modules/matching/service";
export type { MatchingRepository, MatchingClient } from "../modules/matching/ports";
export type { LearningService, CourseCatalogService } from "../modules/learning/service";
export type { CourseCatalog, LearningRepository, LearningClient } from "../modules/learning/ports";
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
