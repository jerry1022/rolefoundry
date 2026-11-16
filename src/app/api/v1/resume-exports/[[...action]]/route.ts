import { resumeHttp } from "@/modules/resume/http";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return resumeHttp(request, "exports", (await context.params).action || []);
}
