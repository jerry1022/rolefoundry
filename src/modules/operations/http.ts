import "server-only";
import { ApplicationError } from "../platform/errors";
import { privateHeaders, errorResponse } from "../platform/http";
import { operationsContext } from "./server";
export async function operationsHttp(request: Request, action: string[]) {
  const requestId = crypto.randomUUID(),
    headers = privateHeaders(requestId);
  try {
    const { actor, service } = await operationsContext(),
      query = new URL(request.url).searchParams,
      tasks = action.length === 1 && action[0] === "tasks",
      events = action.length === 3 && action[0] === "tasks" && action[2] === "events",
      allowed = tasks ? ["kind", "status", "cursor"] : events ? ["cursor"] : [];
    if ([...query.keys()].some((key) => !allowed.includes(key) || query.getAll(key).length !== 1))
      throw new ApplicationError("RF_INVALID_INPUT", 400, "The diagnostics query is invalid.");
    const send = (data: unknown) => Response.json({ data }, { headers });
    if (action.length === 0) return send(await service.summary(actor));
    if (tasks)
      return Response.json(await service.tasks(actor, Object.fromEntries(query)), { headers });
    if (events)
      return Response.json(
        await service.events(actor, action[1], query.get("cursor") ?? undefined),
        { headers },
      );
    if (action.length === 1 && action[0] === "workers") return send(await service.workers(actor));
    if (action.length === 2 && action[0] === "tasks")
      return send(await service.task(actor, action[1]));
    throw new ApplicationError("RF_NOT_FOUND", 404, "The diagnostics resource is unavailable.");
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
