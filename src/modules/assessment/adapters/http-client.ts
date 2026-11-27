import { z } from "zod";
import { createBrowserTransport } from "../../platform/browser-http";
import { ApplicationError } from "../../platform/errors";
import { attemptSchema, attemptPageSchema, questionBankSchema } from "../model";
import type { AssessmentClient, AssessmentAdminClient } from "../ports";
export function createAssessmentClient(fetcher: typeof fetch = fetch): AssessmentClient {
  const request = createBrowserTransport(fetcher);
  async function submit(id: string, path: string, idempotencyKey: string, body: unknown) {
    const response = await fetcher(
      `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/v1/assessments/${encodeURIComponent(id)}/${path}`,
      {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(body),
      },
    );
    const json = await response.json();
    if (!response.ok)
      throw new ApplicationError(
        json.error?.code || "RF_UNAVAILABLE",
        response.status,
        json.error?.message || "Assessment submission is unavailable.",
      );
    return z.object({ taskId: z.uuid(), status: z.string() }).parse(json.data);
  }
  return {
    start: async (track) =>
      attemptSchema.parse((await request("assessments", { method: "POST", body: { track } })).data),
    find: async (id) =>
      attemptSchema.parse((await request(`assessments/${encodeURIComponent(id)}`)).data),
    list: async (cursor) =>
      attemptPageSchema.parse(
        await request(`assessments${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
      ),
    save: async (id, input) =>
      attemptSchema.parse(
        (
          await request(`assessments/${encodeURIComponent(id)}/answers`, {
            method: "PATCH",
            body: input,
          })
        ).data,
      ),
    submit: (id, { idempotencyKey, ...input }) => submit(id, "submit", idempotencyKey, input),
    retry: (id, previousTaskId, key) => submit(id, "retry", key, { previousTaskId }),
  };
}
export function createAssessmentAdminClient(fetcher: typeof fetch = fetch): AssessmentAdminClient {
  const request = createBrowserTransport(fetcher);
  return {
    bank: async () => questionBankSchema.parse((await request("admin/assessments")).data),
    rubric: async (input) =>
      z
        .object({ id: z.uuid() })
        .parse((await request("admin/assessments/rubrics", { method: "POST", body: input })).data),
    question: async (input) =>
      z
        .object({ id: z.uuid() })
        .parse(
          (await request("admin/assessments/questions", { method: "POST", body: input })).data,
        ),
    review: async (id, reason) => {
      await request(`admin/assessments/questions/${encodeURIComponent(id)}/review`, {
        method: "POST",
        body: { reason },
      });
    },
    retire: async (id, reason) => {
      await request(`admin/assessments/questions/${encodeURIComponent(id)}/retire`, {
        method: "POST",
        body: { reason },
      });
    },
  };
}
