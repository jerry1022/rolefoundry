import { z } from "zod";
import { createBrowserTransport } from "../../platform/browser-http";
import {
  courseSchema,
  coursePageSchema,
  courseBankSchema,
  planSchema,
  planHistorySchema,
  courseProgressSchema,
  learningTaskSchema,
} from "../model";
import type { CourseClient, LearningClient, LearningAdminClient } from "../ports";
export function createCourseClient(fetcher: typeof fetch = fetch): CourseClient {
  const request = createBrowserTransport(fetcher);
  return {
    list: async (query) =>
      coursePageSchema.parse(
        await request(
          `courses${Object.keys(query).length ? `?${new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined) as [string, string][])}` : ""}`,
        ),
      ),
    find: async (id) =>
      courseSchema.parse((await request(`courses/${encodeURIComponent(id)}`)).data),
  };
}
export function createLearningClient(fetcher: typeof fetch = fetch): LearningClient {
  const request = createBrowserTransport(fetcher),
    path = (id: string) => `learning-plans/${encodeURIComponent(id)}`;
  return {
    start: async (input, key) =>
      learningTaskSchema.parse(
        (await request("learning-plans", { method: "POST", body: input, idempotencyKey: key }))
          .data,
      ),
    find: async (id) => planSchema.parse((await request(path(id))).data),
    list: async (cursor) =>
      planHistorySchema.parse(
        await request(`learning-plans${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
      ),
    progress: async () => courseProgressSchema.parse((await request("learning-progress")).data),
    courseProgress: async (id, expectedRevision, completed) =>
      courseProgressSchema.parse(
        (
          await request(`learning-progress/courses/${encodeURIComponent(id)}`, {
            method: "PATCH",
            body: { expectedRevision, completed },
          })
        ).data,
      ),
    stepProgress: async (planId, stepId, expectedRevision, completed) =>
      planSchema.parse(
        (
          await request(`${path(planId)}/steps/${encodeURIComponent(stepId)}`, {
            method: "PATCH",
            body: { expectedRevision, completed },
          })
        ).data,
      ),
    practice: async (planId, stepId, input) =>
      planSchema.parse(
        (
          await request(`${path(planId)}/steps/${encodeURIComponent(stepId)}/practice`, {
            method: "POST",
            body: input,
          })
        ).data,
      ),
    removePractice: async (planId, id, expectedRevision) =>
      planSchema.parse(
        (
          await request(`${path(planId)}/practice/${encodeURIComponent(id)}`, {
            method: "DELETE",
            body: { expectedRevision },
          })
        ).data,
      ),
  };
}
export function createLearningAdminClient(fetcher: typeof fetch = fetch): LearningAdminClient {
  const request = createBrowserTransport(fetcher);
  return {
    bank: async () => courseBankSchema.parse((await request("admin/courses")).data),
    source: async (input) =>
      z
        .object({ id: z.uuid() })
        .parse((await request("admin/courses/sources", { method: "POST", body: input })).data),
    sourceStatus: async (id, status, reason) => {
      await request(`admin/courses/sources/${encodeURIComponent(id)}/status`, {
        method: "POST",
        body: { status, reason },
      });
    },
    create: async (input) =>
      z
        .object({ id: z.uuid(), revision: z.number() })
        .parse((await request("admin/courses", { method: "POST", body: input })).data),
    revise: async (id, course, expectedRevision) =>
      z.object({ id: z.uuid(), revision: z.number() }).parse(
        (
          await request(`admin/courses/${encodeURIComponent(id)}`, {
            method: "PATCH",
            body: { course, expectedRevision },
          })
        ).data,
      ),
    transition: async (id, input) => {
      await request(`admin/courses/${encodeURIComponent(id)}/transition`, {
        method: "POST",
        body: input,
      });
    },
    translate: async (id, input) => {
      await request(`admin/courses/${encodeURIComponent(id)}/translations`, {
        method: "POST",
        body: input,
      });
    },
    removeTranslation: async (id, input) => {
      await request(`admin/courses/${encodeURIComponent(id)}/translations/remove`, {
        method: "POST",
        body: input,
      });
    },
  };
}
