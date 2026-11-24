import { observeApi } from "@/modules/telemetry/server";
import { accountDataHttp } from "@/modules/account-data/http";
export const runtime = "nodejs";
async function route(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return observeApi("account.exports", request, async () => {
    return accountDataHttp(request, (await context.params).action ?? []);
  });
}
export { route as GET, route as POST, route as DELETE };
