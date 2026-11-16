import { z } from "zod";
export const applicationStages = ["Saved", "Applied", "Interview", "Offer", "Closed"] as const;
export const stageSchema = z.enum(applicationStages);
export const uuid = z.uuid().transform((value) => value.toLowerCase());
export const revisionSchema = z.number().int().positive();
const text = (maximum: number) =>
  z
    .string()
    .max(maximum)
    .refine((value) => value.length <= maximum)
    .refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value));
const timestamp = z.iso.datetime({ offset: true });
export const trackSchema = z.object({ jobId: uuid }).strict();
export const editSchema = z
  .object({
    expectedRevision: revisionSchema,
    stage: stageSchema,
    note: text(4000),
    resumeVersionId: uuid.nullable(),
    confirmationReference: text(300).nullable(),
  })
  .strict();
export const expectedSchema = z.object({ expectedRevision: revisionSchema }).strict();
export const followUpSchema = z
  .object({
    expectedRevision: revisionSchema,
    title: text(200).trim().min(1),
    dueAt: timestamp.refine((value) => {
      const year = new Date(value).getUTCFullYear();
      return year >= 2000 && year <= 2100;
    }),
  })
  .strict();
export const followUpEditSchema = followUpSchema.extend({ completed: z.boolean() }).strict();
export const sourceSchema = z.object({
  id: uuid,
  name: z.string(),
  publisher: z.string(),
  url: z.url().refine((value) => new URL(value).protocol === "https:"),
  isDemo: z.boolean(),
  available: z.boolean(),
  freshness: z.enum(["current", "uncertain", "closed"]),
});
export const resumeReferenceSchema = z.object({
  id: uuid,
  documentId: uuid,
  version: revisionSchema,
  filename: z.string(),
  createdAt: timestamp,
});
export const followUpRecordSchema = z.object({
  id: uuid,
  title: z.string(),
  dueAt: timestamp,
  completed: z.boolean(),
  createdAt: timestamp,
});
export const applicationSchema = z.object({
  id: uuid,
  ownerId: uuid,
  revision: revisionSchema,
  cycle: revisionSchema,
  jobId: uuid,
  jobVersionId: uuid,
  title: z.string(),
  company: z.string(),
  sources: z.array(sourceSchema),
  available: z.boolean(),
  stage: stageSchema,
  note: z.string(),
  confirmationReference: z.string().nullable(),
  resume: resumeReferenceSchema.nullable(),
  followUps: z.array(followUpRecordSchema).max(50),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export const eventSchema = z.object({
  id: z.string(),
  revision: revisionSchema,
  kind: z.enum(["tracked", "stage", "edited", "follow-up", "resume-removed"]),
  previousStage: stageSchema.nullable(),
  stage: stageSchema,
  actorId: uuid,
  confirmationReference: z.string().nullable(),
  createdAt: timestamp,
});
export const applicationPageSchema = z.object({
  ownerId: uuid,
  data: z.array(applicationSchema),
  nextCursor: z.string().nullable(),
});
export const eventPageSchema = z.object({
  data: z.array(eventSchema),
  nextCursor: z.string().nullable(),
});
export const resumeChoicePageSchema = z.object({
  data: z.array(resumeReferenceSchema),
  nextCursor: z.string().nullable(),
});
export type ResumeChoicePage = z.infer<typeof resumeChoicePageSchema>;
export type Application = z.infer<typeof applicationSchema>;
export type ApplicationEvent = z.infer<typeof eventSchema>;
export type ApplicationPage = z.infer<typeof applicationPageSchema>;
export type EventPage = z.infer<typeof eventPageSchema>;
export type TrackInput = z.infer<typeof trackSchema>;
export type EditInput = z.infer<typeof editSchema>;
export type FollowUpInput = z.infer<typeof followUpSchema>;
export type FollowUpEdit = z.infer<typeof followUpEditSchema>;
