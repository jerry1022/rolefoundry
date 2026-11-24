import { observeApi } from "@/modules/telemetry/server";
import { resumeHttp } from "@/modules/resume/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return observeApi("resume-revisions", request, async () => {
    return resumeHttp(request, "proposals", (await context.params).action || []);
  });
}
export async function POST(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return observeApi("resume-revisions", request, async () => {
    return resumeHttp(request, "proposals", (await context.params).action || []);
  });
}
