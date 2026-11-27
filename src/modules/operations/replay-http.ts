import "server-only";
import { taskReplayContext } from "./server";
import { replayInputSchema } from "./replay";
import { ApplicationError } from "../platform/errors";
import { privateHeaders, errorResponse, requireSameOrigin, readJsonBody } from "../platform/http";
export async function taskReplayHttp(request: Request, action: string[]) {
  const requestId = crypto.randomUUID(),
    headers = privateHeaders(requestId);
  try {
    const { actor, config, replay } = await taskReplayContext();
    requireSameOrigin(request, config.appOrigin);
    if (new URL(request.url).search)
      throw new ApplicationError("RF_INVALID_INPUT", 400, "Replay accepts no query parameters.");
    if (action.length !== 3 || action[0] !== "tasks" || action[2] !== "replay")
      throw new ApplicationError("RF_NOT_FOUND", 404, "The task recovery resource is unavailable.");
    if (request.method === "GET")
      return Response.json({ data: await replay.preview(actor, action[1]) }, { headers });
    if (request.method === "POST")
      return Response.json(
        {
          data: await replay.request(
            actor,
            action[1],
            await readJsonBody(request, replayInputSchema, 512),
          ),
        },
        { headers, status: 202 },
      );
    throw new ApplicationError("RF_NOT_FOUND", 404, "The task recovery resource is unavailable.");
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
