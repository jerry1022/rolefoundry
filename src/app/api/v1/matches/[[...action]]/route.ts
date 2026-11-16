import { matchingHttp } from "@/modules/matching/http";
export const dynamic = "force-dynamic";
async function handle(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return matchingHttp(request, (await context.params).action || []);
}
export const GET = handle;
export const POST = handle;
