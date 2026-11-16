import "server-only";
import { matchingContext } from "./server";
import { refreshMatchSchema } from "./model";
import { ApplicationError } from "../platform/errors";
import { requireSameOrigin, readJsonBody, privateHeaders, errorResponse } from "../platform/http";
export async function matchingHttp(request: Request, action: string[]) {
  const requestId = crypto.randomUUID();
  try {
    const { actor, config, service } = await matchingContext();
    requireSameOrigin(request, config.appOrigin);
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some((key) => key !== "cursor" || params.getAll(key).length !== 1))
      throw new ApplicationError("RF_INVALID_INPUT", 400, "The query is invalid.");
    const cursor = params.get("cursor") || undefined;
    if (request.method === "GET" && !action.length)
      return Response.json(await service.list(actor, cursor), {
        headers: privateHeaders(requestId),
      });
    if (request.method === "GET" && action.length === 1)
      return Response.json(
        { data: await service.find(actor, action[0], cursor) },
        { headers: privateHeaders(requestId) },
      );
    if (request.method === "POST" && !action.length) {
      if (params.size) throw new ApplicationError("RF_INVALID_INPUT", 400, "The query is invalid.");
      const data = await service.refresh(
        actor,
        await readJsonBody(request, refreshMatchSchema, 32768),
        request.headers.get("idempotency-key"),
      );
      return Response.json({ data }, { status: 202, headers: privateHeaders(requestId) });
    }
    throw new ApplicationError("RF_NOT_FOUND", 404, "The resource is unavailable.");
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
