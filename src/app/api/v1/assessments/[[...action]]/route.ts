import { assessmentHttp } from "@/modules/assessment/http";
export const dynamic = "force-dynamic";
async function handle(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return assessmentHttp(request, "assessment", (await context.params).action || []);
}
export { handle as GET, handle as POST, handle as PATCH };
