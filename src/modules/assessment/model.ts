import { z } from "zod";
import { tracks } from "../skills/catalog";
import { skillIdSchema } from "../skills/model";
const text = (max: number) => z.string().trim().min(1).max(max);
export const answerMapSchema = z
  .record(z.uuid(), z.number().int().min(0).max(9))
  .refine(
    (v) =>
      Object.keys(v).length <= 20 &&
      new Set(Object.keys(v).map((id) => id.toLowerCase())).size === Object.keys(v).length,
  );
export const saveAnswersSchema = z
  .object({ expectedRevision: z.number().int().positive(), answers: answerMapSchema })
  .strict();
export const submitSchema = saveAnswersSchema
  .extend({ idempotencyKey: z.string().min(8).max(200) })
  .strict();
export const rubricInputSchema = z
  .object({ key: text(100), version: z.number().int().positive(), description: text(2000) })
  .strict();
export const questionInputSchema = z
  .object({
    key: text(100),
    version: z.number().int().positive(),
    track: z.enum(tracks),
    skillId: skillIdSchema,
    rubricId: z.uuid(),
    prompt: text(3000),
    options: z.array(text(1000)).min(2).max(10),
    correctIndex: z.number().int().min(0).max(9),
    explanation: text(3000),
  })
  .strict()
  .refine((v) => v.correctIndex < v.options.length);
/** Reviewed translation of one immutable question version (options keep order and count). */
const questionTranslationSchema = z.object({
  prompt: z.string(),
  options: z.array(z.string()),
  reviewedAt: z.string(),
  /** Present only once the attempt is graded, like the source explanation. */
  explanation: z.string().optional(),
});
const questionTranslationsSchema = z
  .object({ "zh-TW": questionTranslationSchema.optional() })
  .optional();
export const questionTranslationInputSchema = z
  .object({
    locale: z.literal("zh-TW"),
    prompt: text(3000),
    options: z.array(text(1000)).min(2).max(10),
    explanation: text(3000),
    reviewNote: text(1000),
  })
  .strict();
export type QuestionTranslationInput = z.infer<typeof questionTranslationInputSchema>;
export const questionTranslationRemovalSchema = z
  .object({ locale: z.literal("zh-TW"), reason: text(1000) })
  .strict();
export type QuestionTranslationRemoval = z.infer<typeof questionTranslationRemovalSchema>;

/**
 * Question text for the viewer's locale. A translation applies only when its options align
 * one-to-one with the source, so a selected index always means the same answer.
 */
export function localizedQuestion(
  item: {
    prompt: string;
    options: string[];
    translations?: z.infer<typeof questionTranslationsSchema>;
  },
  locale: string,
) {
  const translation = locale === "zh-TW" ? item.translations?.["zh-TW"] : undefined;
  if (!translation || translation.options.length !== item.options.length)
    return { prompt: item.prompt, options: item.options, explanation: null, lang: "en" as const };
  return {
    prompt: translation.prompt,
    options: translation.options,
    explanation: translation.explanation ?? null,
    lang: "zh-Hant" as const,
  };
}
export const publicItemSchema = z.object({
  id: z.uuid(),
  questionVersionId: z.uuid(),
  rubricVersionId: z.uuid(),
  prompt: z.string(),
  options: z.array(z.string()),
  skillId: skillIdSchema,
  skillLabel: z.string(),
  skillLabelZhTw: z.string().optional(),
  dictionaryVersion: z.number().int().positive(),
  translations: questionTranslationsSchema,
});
export const assessmentResultSchema = z.object({
  id: z.uuid(),
  recipe: z.literal("mcq-v1"),
  correct: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  createdAt: z.string(),
  observations: z.array(
    z.object({
      itemId: z.uuid(),
      correct: z.boolean(),
      selectedIndex: z.number().int(),
      correctIndex: z.number().int(),
      explanation: z.string(),
      evidenceId: z.uuid(),
    }),
  ),
});
export const attemptSchema = z.object({
  id: z.uuid(),
  track: z.enum(tracks),
  revision: z.number().int().positive(),
  status: z.enum(["draft", "submitted", "completed", "failed"]),
  items: z.array(publicItemSchema),
  answers: answerMapSchema,
  taskId: z.uuid().nullable(),
  createdAt: z.string(),
  result: assessmentResultSchema.nullable(),
});
export type AssessmentAttempt = z.infer<typeof attemptSchema>;
export const attemptSummarySchema = attemptSchema.pick({
  id: true,
  track: true,
  revision: true,
  status: true,
  createdAt: true,
  taskId: true,
});
export const attemptPageSchema = z.object({
  data: z.array(attemptSummarySchema),
  nextCursor: z.string().nullable(),
});
export const questionAdminSchema = questionInputSchema.extend({
  id: z.uuid(),
  reviewed: z.boolean(),
  dictionaryVersion: z.number().int().positive(),
  translations: questionTranslationsSchema,
});
export const rubricAdminSchema = rubricInputSchema.extend({ id: z.uuid() });
export const questionBankSchema = z.object({
  rubrics: z.array(rubricAdminSchema),
  questions: z.array(questionAdminSchema),
});
export type QuestionBank = z.infer<typeof questionBankSchema>;
export function gradeFixedAnswers(
  items: { id: string; correctIndex: number; options: string[] }[],
  answers: Record<string, number>,
) {
  if (
    Object.keys(answers).length !== items.length ||
    items.some(
      (item) =>
        !Object.hasOwn(answers, item.id) ||
        answers[item.id] < 0 ||
        answers[item.id] >= item.options.length,
    ) ||
    Object.keys(answers).some((id) => !items.some((item) => item.id === id))
  )
    throw new Error("Invalid complete answer set");
  return {
    correct: items.filter((item) => answers[item.id] === item.correctIndex).length,
    total: items.length,
  };
}
