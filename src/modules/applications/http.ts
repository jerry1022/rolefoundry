import "server-only";
import { z } from "zod";
import { applicationContext } from "./server";
import { ApplicationError } from "../platform/errors";
import { readJsonBody, requireSameOrigin, privateHeaders, errorResponse } from "../platform/http";
export async function applicationHttp(request: Request, action: string[]) {
  const requestId = crypto.randomUUID(),
    headers = privateHeaders(requestId),
    send = (data: unknown, status = 200) => Response.json({ data }, { status, headers });
  try {
    const query = new URL(request.url).searchParams,
      list =
        request.method === "GET" &&
        (!action.length ||
          action.join("/") === "resume-choices" ||
          (action.length === 2 && action[1] === "events"));
    if (
      [...query.keys()].some((key) => !list || key !== "cursor" || query.getAll(key).length !== 1)
    )
      throw new ApplicationError("RF_INVALID_INPUT", 400, "The query is invalid.");
    const { actor, config, service } = await applicationContext();
    requireSameOrigin(request, config.appOrigin);
    const body = () => readJsonBody(request, z.unknown(), 24576),
      key = () => request.headers.get("idempotency-key");
    if (action.join("/") === "resume-choices" && request.method === "GET")
      return Response.json(await service.resumeChoices(actor, query.get("cursor") ?? undefined), {
        headers,
      });
    if (!action.length && request.method === "GET")
      return Response.json(await service.list(actor, query.get("cursor") ?? undefined), {
        headers,
      });
    if (!action.length && request.method === "POST")
      return send(await service.track(actor, await body(), key()), 201);
    if (action.length === 1) {
      if (request.method === "GET") return send(await service.find(actor, action[0]));
      if (request.method === "PATCH")
        return send(await service.edit(actor, action[0], await body()));
      if (request.method === "DELETE")
        return send(await service.remove(actor, action[0], await body()));
    }
    if (action.length === 2 && action[1] === "events" && request.method === "GET")
      return Response.json(
        await service.events(actor, action[0], query.get("cursor") ?? undefined),
        { headers },
      );
    if (action.length === 2 && action[1] === "new-cycle" && request.method === "POST")
      return send(await service.newCycle(actor, action[0], await body(), key()), 201);
    if (action.length === 2 && action[1] === "follow-ups" && request.method === "POST")
      return send(await service.addFollowUp(actor, action[0], await body(), key()), 201);
    if (action.length === 3 && action[1] === "follow-ups") {
      if (request.method === "PATCH")
        return send(await service.editFollowUp(actor, action[0], action[2], await body()));
      if (request.method === "DELETE")
        return send(await service.removeFollowUp(actor, action[0], action[2], await body()));
    }
    throw new ApplicationError("RF_NOT_FOUND", 404, "The resource is unavailable.");
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
