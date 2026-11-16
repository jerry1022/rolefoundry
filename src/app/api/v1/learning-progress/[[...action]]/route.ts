import { learningHttp } from "@/modules/learning/http";
export const dynamic = "force-dynamic";
async function handle(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return learningHttp(request, "progress", (await context.params).action || []);
}
export { handle as GET, handle as PATCH };
