import { operationsHttp } from "@/modules/operations/http";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return operationsHttp(request, (await context.params).action ?? []);
}
