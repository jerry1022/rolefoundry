import { observeApi } from "@/modules/telemetry/server";
import { catalogHttp } from "@/modules/jobs/http";
export const dynamic = "force-dynamic";
async function handle(request: Request, context: { params: Promise<{ action: string[] }> }) {
  return observeApi("admin.catalog", request, async () => {
    return catalogHttp(request, "admin", (await context.params).action);
  });
}
export { handle as POST, handle as PATCH };
