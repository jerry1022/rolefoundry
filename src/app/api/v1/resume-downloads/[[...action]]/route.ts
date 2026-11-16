import { resumeHttp } from "@/modules/resume/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return resumeHttp(request, "downloads", (await context.params).action || []);
}
