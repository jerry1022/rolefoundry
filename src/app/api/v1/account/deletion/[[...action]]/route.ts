import { deletionHttp } from "@/modules/account-deletion/http";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return deletionHttp(request, (await context.params).action ?? []);
}
