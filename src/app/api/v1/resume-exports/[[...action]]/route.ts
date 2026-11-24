import { observeApi } from "@/modules/telemetry/server";
import { resumeHttp } from "@/modules/resume/http";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return observeApi("resume-exports", request, async () => {
    return resumeHttp(request, "exports", (await context.params).action || []);
  });
}
