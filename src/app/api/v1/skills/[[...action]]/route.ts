import { skillHttp } from "@/modules/skills/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return skillHttp(request, false, (await context.params).action || []);
}
