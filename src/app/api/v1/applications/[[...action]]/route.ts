import { observeApi } from "@/modules/telemetry/server";
import { applicationHttp } from "@/modules/applications/http";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return observeApi("applications", request, async () => {
    return applicationHttp(request, (await context.params).action ?? []);
  });
}
export const POST = GET;
export const PATCH = GET;
export const DELETE = GET;
