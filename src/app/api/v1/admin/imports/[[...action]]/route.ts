import { observeApi } from "@/modules/telemetry/server";
import { ingestionHttp } from "@/modules/ingestion/http";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return observeApi("admin.imports", request, async () => {
    return ingestionHttp(request, (await context.params).action ?? []);
  });
}
export const POST = GET;
export const PATCH = GET;
