import { z } from "zod";
import { getCareerPath, type CareerPathId } from "./career-paths";

import { tracks, skillLabels, type Track, type Skill } from "../modules/skills/catalog";
export { tracks, skillLabels, type Track, type Skill } from "../modules/skills/catalog";
export interface Job {
  id: string;
  title: string;
  company: string;
  initials: string;
  color: string;
  track: Track;
  specialization: CareerPathId;
  location: string;
  mode: "Hybrid" | "Remote" | "On-site";
  level: string;
  salary: string;
  skills: Skill[];
  summary: string;
  responsibilities: string[];
  added: string;
}
export interface Course {
  id: string;
  title: string;
  provider: "DeepLearning.AI";
  /** ISO date the title/level/format/URL were last checked against the official catalog. */
  reviewedAt: string;
  url: string;
  skills: Skill[];
  prerequisites: Skill[];
  level: "Beginner" | "Intermediate";
  format: string;
  summary: string;
  exercise: string;
}
export interface Question {
  id: string;
  track: Track;
  skill: Skill;
  prompt: string;
  options: string[];
  correct: number;
  explanation: string;
}
export const stages = ["Saved", "Applied", "Interview", "Offer", "Closed"] as const;
export type Stage = (typeof stages)[number];
export const evidenceSchema = z.object({
  skill: z.enum(Object.keys(skillLabels) as [Skill, ...Skill[]]),
  source: z.enum(["self-report", "scenario"]),
  level: z.number().min(0).max(3),
  updatedAt: z.string(),
});
export type Evidence = z.infer<typeof evidenceSchema>;
export const workspaceSchema = z.object({
  version: z.literal(1),
  name: z.string().max(100),
  track: z.enum(tracks),
  knownSkills: z.array(z.enum(Object.keys(skillLabels) as [Skill, ...Skill[]])),
  savedJobs: z.array(z.string()),
  completedCourses: z.array(z.string()),
  applications: z.array(
    z.object({ jobId: z.string(), stage: z.enum(stages), note: z.string().max(3000) }),
  ),
  evidence: z.array(evidenceSchema),
  resume: z.string().max(30000),
});
export type Workspace = z.infer<typeof workspaceSchema>;
export const initialWorkspace: Workspace = {
  version: 1,
  name: "Alex",
  track: "Engineering & data",
  knownSkills: ["python", "sql", "prompting"],
  savedJobs: [],
  completedCourses: [],
  applications: [],
  evidence: [],
  resume:
    "Alex Morgan\nAI application developer\n\nBuilt Python APIs and SQL reporting workflows.\nExplored prompt design for document summarization.\n\nProjects\nDocument assistant — prototype in progress.\n\nSkills\nPython, SQL, API development, prompt design",
};

export function matchJob(job: Job, skills: Skill[]) {
  const covered = job.skills.filter((skill) => skills.includes(skill));
  const missing = job.skills.filter((skill) => !skills.includes(skill));
  return { covered, missing, coverage: Math.round((covered.length / job.skills.length) * 100) };
}

export function searchJobs(
  jobs: Job[],
  query: string,
  track: string,
  mode: string,
  skills: Skill[],
  specialization: CareerPathId | "all" = "all",
) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return jobs
    .filter((job) => {
      const text = [
        job.title,
        job.company,
        job.location,
        getCareerPath(job.specialization).title,
        ...getCareerPath(job.specialization).aliases,
        ...job.skills.map((s) => `${s} ${skillLabels[s]}`),
      ]
        .join(" ")
        .toLowerCase();
      return (
        terms.every((term) => text.includes(term)) &&
        (track === "All tracks" || job.track === track) &&
        (mode === "Any workplace" || job.mode === mode) &&
        (specialization === "all" || job.specialization === specialization)
      );
    })
    .sort(
      (a, b) =>
        matchJob(b, skills).coverage - matchJob(a, skills).coverage || a.id.localeCompare(b.id),
    );
}

export function recommendCourses(courses: Course[], gaps: Skill[], known: Skill[]) {
  return courses
    .map((course) => ({
      course,
      addresses: course.skills.filter((s) => gaps.includes(s)),
      prerequisitesMissing: course.prerequisites.filter((s) => !known.includes(s)),
    }))
    .filter((result) => result.addresses.length > 0)
    .sort(
      (a, b) =>
        a.prerequisitesMissing.length - b.prerequisitesMissing.length ||
        b.addresses.length - a.addresses.length ||
        a.course.id.localeCompare(b.course.id),
    );
}

export function gradeAssessment(questions: Question[], answers: Record<string, number>) {
  const results = questions.map((question) => ({
    question,
    correct: answers[question.id] === question.correct,
  }));
  return { results, correct: results.filter((r) => r.correct).length, total: questions.length };
}

export interface ServiceResult<T> {
  data: T;
  source: "fixture" | "live";
  generatedAt: string;
}
export interface JobRepository {
  list(): Promise<Job[]>;
  find(id: string): Promise<Job | null>;
}
export interface CourseRepository {
  list(): Promise<Course[]>;
}
export interface AIProvider {
  analyze<T>(input: { task: string; text: string; schema: z.ZodType<T> }): Promise<T>;
}
export const taskSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  kind: z.enum([
    "resume.parse",
    "assessment.grade",
    "matches.refresh",
    "learning.plan",
    "resume.revise",
    "resume.export",
    "catalog.import",
  ]),
  inputVersion: z.string(),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  attempts: z.number().int().min(0),
});
export type Task = z.infer<typeof taskSchema>;
