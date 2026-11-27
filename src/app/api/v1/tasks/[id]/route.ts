import { observeApi } from "@/modules/telemetry/server";
import { assessmentHttp } from "@/modules/assessment/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return observeApi("tasks", request, async () => {
    return assessmentHttp(request, "tasks", [(await context.params).id]);
  });
}
