import { observeApi } from "@/modules/telemetry/server";
import { resumeHttp } from "@/modules/resume/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return observeApi("resume-downloads", request, async () => {
    return resumeHttp(request, "downloads", (await context.params).action || []);
  });
}
