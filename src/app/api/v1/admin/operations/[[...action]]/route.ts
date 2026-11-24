import { observeApi } from "@/modules/telemetry/server";
import { operationsHttp } from "@/modules/operations/http";
import { taskReplayHttp } from "@/modules/operations/replay-http";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return observeApi("admin.operations", request, async () => {
    const action = (await context.params).action ?? [];
    return action[2] === "replay"
      ? taskReplayHttp(request, action)
      : operationsHttp(request, action);
  });
}

export async function POST(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return observeApi("admin.operations", request, async () => {
    return taskReplayHttp(request, (await context.params).action ?? []);
  });
}
