import { createBrowserTransport } from "../../platform/browser-http";
import { linkAdminSchema, linkQuerySchema, linkResumeSchema } from "../model";
export function createCourseLinkClient(fetcher: typeof fetch = fetch) {
  const request = createBrowserTransport(fetcher);
  return {
    async list(query: { cursor?: string; hostCursor?: string } = {}, signal?: AbortSignal) {
      const params = new URLSearchParams(linkQuerySchema.parse(query));
      return linkAdminSchema.parse(
        (await request(`admin/courses/link-checks${params.size ? `?${params}` : ""}`, { signal }))
          .data,
      );
    },
    async resume(input: { host: string; expectedRevision: number; reason: string }) {
      await request("admin/courses/link-checks/resume", {
        method: "POST",
        body: linkResumeSchema.parse(input),
      });
    },
  };
}
