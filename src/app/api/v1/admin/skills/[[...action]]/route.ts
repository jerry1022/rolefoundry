import { skillHttp } from "@/modules/skills/http";
export const dynamic = "force-dynamic";
async function handle(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return skillHttp(request, true, (await context.params).action || []);
}
export { handle as POST, handle as PATCH, handle as DELETE };
