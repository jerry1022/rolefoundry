import { observeApi } from "@/modules/telemetry/server";
import { assessmentHttp } from "@/modules/assessment/http";
export const dynamic = "force-dynamic";
async function handle(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return observeApi("admin.assessments", request, async () => {
    return assessmentHttp(request, "admin", (await context.params).action || []);
  });
}
export { handle as GET, handle as POST };
