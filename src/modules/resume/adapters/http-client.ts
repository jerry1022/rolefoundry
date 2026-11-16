import { createBrowserTransport } from "../../platform/browser-http";
import { ApplicationError } from "../../platform/errors";
import type { ResumeClient } from "../ports";
import {
  resumeListSchema,
  resumeDocumentSchema,
  resumeVersionSchema,
  resumeUploadSchema,
  resumeDocumentTaskSchema,
  resumeTaskReplySchema,
  proposalSchema,
  downloadIntentSchema,
  deletionSchema,
  resumeLimits,
} from "../model";
async function requireOk(response: Response) {
  if (response.ok) return;
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApplicationError(
      "RF_UNAVAILABLE",
      response.status,
      "The resume service is unavailable.",
    );
  }
  throw new ApplicationError(
    data.error?.code || "RF_UNAVAILABLE",
    response.status,
    data.error?.message || "The resume operation failed.",
  );
}
export function createResumeClient(fetcher: typeof fetch = fetch): ResumeClient {
  const transport = createBrowserTransport(fetcher),
    request = (path: string, options: Parameters<typeof transport>[1] = {}) =>
      transport(path, { signal: AbortSignal.timeout(30000), ...options });
  const base = () => `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/v1/`;
  return {
    async retryParse(id, previousTaskId, key) {
      return resumeDocumentTaskSchema.parse(
        (
          await request(`resumes/${id}/parse`, {
            method: "POST",
            body: { previousTaskId },
            idempotencyKey: key,
          })
        ).data,
      );
    },
    async list(cursor) {
      return resumeListSchema.parse(
        await request(`resumes${cursor ? "?cursor=" + encodeURIComponent(cursor) : ""}`),
      );
    },
    async find(id) {
      return resumeDocumentSchema.parse((await request(`resumes/${id}`)).data);
    },
    async version(id) {
      return resumeVersionSchema.parse((await request(`resume-versions/${id}`)).data);
    },
    async intent(input, key) {
      return resumeUploadSchema.parse(
        (
          await request("resumes/upload-intents", {
            method: "POST",
            body: input,
            idempotencyKey: key,
          })
        ).data,
      );
    },
    async upload(id, token, file) {
      const media =
        file.type ||
        (file.name.toLowerCase().endsWith(".pdf")
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      const response = await fetcher(`${base()}resumes/${id}/source`, {
        method: "PUT",
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.timeout(40000),
        headers: { "Content-Type": media, "X-Upload-Token": token },
        body: file,
      });
      await requireOk(response);
      return resumeDocumentSchema.parse((await response.json()).data);
    },
    async paste(text, key) {
      return resumeDocumentTaskSchema.parse(
        (await request("resumes/paste", { method: "POST", body: { text }, idempotencyKey: key }))
          .data,
      );
    },
    async confirm(id, expectedRevision, content) {
      return resumeDocumentSchema.parse(
        (
          await request(`resumes/${id}/confirm`, {
            method: "POST",
            body: { expectedRevision, content },
          })
        ).data,
      );
    },
    async revise(id, versionId, jobId, expectedRevision, key) {
      return resumeTaskReplySchema.parse(
        (
          await request(`resumes/${id}/revisions`, {
            method: "POST",
            body: { versionId, jobId, expectedRevision },
            idempotencyKey: key,
          })
        ).data,
      );
    },
    async proposal(id) {
      return proposalSchema.parse((await request(`resume-revisions/${id}`)).data);
    },
    async accept(id, expectedRevision, changeIds) {
      return resumeDocumentSchema.parse(
        (
          await request(`resume-revisions/${id}/accept`, {
            method: "POST",
            body: { expectedRevision, changeIds },
          })
        ).data,
      );
    },
    async export(id, versionId, key) {
      return resumeTaskReplySchema.parse(
        (
          await request(`resumes/${id}/exports`, {
            method: "POST",
            body: { versionId },
            idempotencyKey: key,
          })
        ).data,
      );
    },
    async download(exportId) {
      const intent = downloadIntentSchema.parse(
        (await request(`resume-exports/${exportId}/download-intents`, { method: "POST", body: {} }))
          .data,
      );
      const response = await fetcher(`${base()}resume-downloads/${intent.id}`, {
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.timeout(30000),
      });
      await requireOk(response);
      if (response.headers.get("content-type")?.split(";")[0] !== "application/pdf")
        throw new ApplicationError("RF_UNAVAILABLE", 503, "The verified PDF is unavailable.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > resumeLimits.exportBytes)
        throw new ApplicationError("RF_TOO_LARGE", 413, "The export exceeds its download limit.");
      const filename =
        response.headers
          .get("content-disposition")
          ?.match(/filename="([a-zA-Z0-9.-]+\.pdf)"/)?.[1] || "resume.pdf";
      return { bytes, filename };
    },
    async remove(id, expectedRevision) {
      return deletionSchema.parse(
        (await request(`resumes/${id}`, { method: "DELETE", body: { expectedRevision } })).data,
      );
    },
  };
}
