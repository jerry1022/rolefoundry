import { observeApi } from "@/modules/telemetry/server";
import { deletionHttp } from "@/modules/account-deletion/http";
export const runtime = "nodejs";
async function route(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return observeApi("admin.account-deletions", request, async () => {
    return deletionHttp(request, (await context.params).action ?? [], true);
  });
}
export { route as GET, route as POST };
