import { observeApi } from "@/modules/telemetry/server";
import { catalogHttp } from "@/modules/jobs/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return observeApi("jobs", request, async () => {
    return catalogHttp(request, "jobs", (await context.params).action || []);
  });
}
