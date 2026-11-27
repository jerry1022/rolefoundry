import { catalogHttp } from "@/modules/jobs/http";
export const dynamic = "force-dynamic";
async function handle(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return catalogHttp(request, "bookmarks", (await context.params).action || []);
}
export { handle as GET, handle as PUT, handle as DELETE };
