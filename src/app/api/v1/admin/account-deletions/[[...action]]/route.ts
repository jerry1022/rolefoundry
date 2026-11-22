import { deletionHttp } from "@/modules/account-deletion/http";
export const runtime = "nodejs";
async function route(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return deletionHttp(request, (await context.params).action ?? [], true);
}
export { route as GET, route as POST };
