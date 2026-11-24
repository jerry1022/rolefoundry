import { observeApi } from "@/modules/telemetry/server";
import { profileHttp } from "@/modules/profile/http";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ action?: string[] }> };
async function handle(request: Request, context: Context) {
  return observeApi("profile", request, async () => {
    return profileHttp(request, "profile", (await context.params).action || []);
  });
}
export { handle as GET, handle as PATCH, handle as POST };
