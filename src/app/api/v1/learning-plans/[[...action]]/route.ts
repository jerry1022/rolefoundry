import { observeApi } from "@/modules/telemetry/server";
import { learningHttp } from "@/modules/learning/http";
export const dynamic = "force-dynamic";
async function handle(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return observeApi("learning-plans", request, async () => {
    return learningHttp(request, "plans", (await context.params).action || []);
  });
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
