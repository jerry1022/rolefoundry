import { profileHttp } from "@/modules/profile/http";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ action?: string[] }> };
async function handle(request: Request, context: Context) {
  return profileHttp(request, "profile", (await context.params).action || []);
}
export { handle as GET, handle as PATCH, handle as POST };
