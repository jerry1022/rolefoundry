import { assessmentHttp } from "@/modules/assessment/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return assessmentHttp(request, "tasks", [(await context.params).id]);
}
