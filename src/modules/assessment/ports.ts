import type { z } from "zod";
import type { Actor } from "../identity/core";
import type { Track } from "../skills/catalog";
import type {
  AssessmentAttempt,
  QuestionBank,
  saveAnswersSchema,
  submitSchema,
  rubricInputSchema,
  questionInputSchema,
  attemptPageSchema,
  QuestionTranslationInput,
  QuestionTranslationRemoval,
} from "./model";
export interface AssessmentAuthorization {
  authorize(actor: Actor, action: string, ownerId?: string): Promise<void>;
}
export interface AssessmentRepository {
  retry(
    id: string,
    previousTaskId: string,
    idempotencyKey: string,
  ): Promise<{ taskId: string; status: string }>;
  start(track: Track): Promise<AssessmentAttempt>;
  find(id: string): Promise<AssessmentAttempt>;
  list(cursor?: string): Promise<z.infer<typeof attemptPageSchema>>;
  save(id: string, input: z.infer<typeof saveAnswersSchema>): Promise<AssessmentAttempt>;
  submit(
    id: string,
    input: z.infer<typeof submitSchema>,
  ): Promise<{ taskId: string; status: string }>;
}
export interface AssessmentAdministrationRepository {
  bank(): Promise<QuestionBank>;
  rubric(input: z.infer<typeof rubricInputSchema>): Promise<{ id: string }>;
  question(input: z.infer<typeof questionInputSchema>): Promise<{ id: string }>;
  review(id: string, reason: string): Promise<void>;
  retire(id: string, reason: string): Promise<void>;
  translate(id: string, input: QuestionTranslationInput): Promise<void>;
  removeTranslation(id: string, input: QuestionTranslationRemoval): Promise<void>;
}
export interface AssessmentClient extends AssessmentRepository {}
export interface AssessmentAdminClient extends AssessmentAdministrationRepository {}
