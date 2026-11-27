import { observeApi } from "@/modules/telemetry/server";
import { identityHttp } from "@/modules/identity/http";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ action: string[] }> };
async function dispatch(request: Request, context: Context) {
  return observeApi("identity", request, async () => {
    return identityHttp(request, (await context.params).action);
  });
}
export const GET = dispatch;
export const POST = dispatch;
export const DELETE = dispatch;
