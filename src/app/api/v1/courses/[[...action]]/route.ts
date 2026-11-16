import { learningHttp } from "@/modules/learning/http";
export const dynamic = "force-dynamic";
async function handle(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return learningHttp(request, "courses", (await context.params).action || []);
}
export { handle as GET };
