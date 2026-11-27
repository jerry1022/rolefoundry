import { observeApi } from "@/modules/telemetry/server";
import { resumeHttp } from "@/modules/resume/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return observeApi("resumes", request, async () => {
    return resumeHttp(request, "documents", (await context.params).action || []);
  });
}
export async function POST(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return observeApi("resumes", request, async () => {
    return resumeHttp(request, "documents", (await context.params).action || []);
  });
}
export async function PUT(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return observeApi("resumes", request, async () => {
    return resumeHttp(request, "documents", (await context.params).action || []);
  });
}
export async function DELETE(
  request: Request,
  context: { params: Promise<{ action?: string[] }> },
) {
  return observeApi("resumes", request, async () => {
    return resumeHttp(request, "documents", (await context.params).action || []);
  });
}
