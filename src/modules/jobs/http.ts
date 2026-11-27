import "server-only";
import { z } from "zod";
import { publicCatalogContext, privateCatalogContext } from "./server";
import { privateHeaders, errorResponse, readJsonBody, requireSameOrigin } from "../platform/http";
import { ApplicationError } from "../platform/errors";
function query(request: Request, allowed: string[]) {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some((key) => !allowed.includes(key) || params.getAll(key).length !== 1))
    throw new ApplicationError("RF_INVALID_INPUT", 400, "The query is invalid.");
  return Object.fromEntries(
    [...params].map(([key, value]) => [key, key === "limit" ? Number(value) : value]),
  );
}
export async function catalogHttp(
  request: Request,
  resource: "jobs" | "bookmarks" | "admin",
  action: string[],
) {
  const requestId = crypto.randomUUID();
  const send = (data: unknown, status = 200) =>
    Response.json({ data }, { status, headers: privateHeaders(requestId) });
  try {
    if (resource === "jobs" && request.method === "GET") {
      const catalog = publicCatalogContext();
      if (!action.length)
        return Response.json(
          await catalog.list(
            query(request, [
              "q",
              "track",
              "specialization",
              "workplace",
              "location",
              "level",
              "limit",
              "cursor",
            ]),
          ),
          { headers: privateHeaders(requestId) },
        );
      if (action.length === 1) return send(await catalog.find(action[0]));
      throw new ApplicationError("RF_NOT_FOUND", 404, "The resource is unavailable.");
    }
    const { actor, config, bookmarks, admin } = await privateCatalogContext();
    requireSameOrigin(request, config.appOrigin);
    if (resource === "bookmarks") {
      if (!action.length && request.method === "GET")
        return Response.json(await bookmarks.list(actor, query(request, ["limit", "cursor"])), {
          headers: privateHeaders(requestId),
        });
      if (action.length === 1) {
        if (!z.uuid().safeParse(action[0]).success)
          throw new ApplicationError("RF_NOT_FOUND", 404, "The job is unavailable.");
        if (request.method === "PUT") {
          if (request.body) await readJsonBody(request, z.object({}).strict());
          return send(await bookmarks.save(actor, action[0]));
        }
        if (request.method === "DELETE") {
          if (request.body) await readJsonBody(request, z.object({}).strict());
          return send(await bookmarks.remove(actor, action[0]));
        }
      }
    }
    if (resource === "admin") {
      const body = () => readJsonBody(request, z.unknown(), 65536);
      if (action.join("/") === "sources" && request.method === "POST")
        return send(await admin.source(actor, await body()), 201);
      if (
        action.length === 3 &&
        action[0] === "sources" &&
        action[2] === "status" &&
        request.method === "POST"
      ) {
        await admin.sourceStatus(actor, action[1], await body());
        return send({ updated: true });
      }
      if (action.join("/") === "jobs" && request.method === "POST")
        return send(await admin.create(actor, await body()), 201);
      if (action.length === 2 && action[0] === "jobs" && request.method === "PATCH")
        return send(await admin.revise(actor, action[1], await body()));
      if (
        action.length === 3 &&
        action[0] === "jobs" &&
        action[2] === "status" &&
        request.method === "POST"
      )
        return send(await admin.transition(actor, action[1], await body()));
      if (
        action.length === 3 &&
        action[0] === "jobs" &&
        action[2] === "sources" &&
        request.method === "POST"
      ) {
        await admin.link(actor, action[1], await body());
        return send({ linked: true });
      }
      if (
        action.length === 3 &&
        action[0] === "observations" &&
        action[2] === "record" &&
        request.method === "POST"
      ) {
        await admin.observe(actor, action[1], await body());
        return send({ recorded: true });
      }
    }
    throw new ApplicationError("RF_NOT_FOUND", 404, "The resource is unavailable.");
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
