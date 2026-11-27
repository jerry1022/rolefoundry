import "server-only";
import { z } from "zod";
import { publicLearningContext, privateLearningContext } from "./server";
import { ApplicationError } from "../platform/errors";
import { errorResponse, privateHeaders, requireSameOrigin, readJsonBody } from "../platform/http";
export async function learningHttp(
  request: Request,
  resource: "courses" | "plans" | "progress" | "admin",
  action: string[],
) {
  const requestId = crypto.randomUUID(),
    send = (data: unknown, status = 200) =>
      Response.json({ data }, { status, headers: privateHeaders(requestId) });
  try {
    const params = new URL(request.url).searchParams;
    if (
      [...params.keys()].some(
        (key) =>
          params.getAll(key).length !== 1 ||
          !(
            resource === "courses"
              ? ["skill", "difficulty", "cursor"]
              : resource === "admin" &&
                  action.join("/") === "link-checks" &&
                  request.method === "GET"
                ? ["cursor", "hostCursor"]
                : resource === "plans" && !action.length
                  ? ["cursor"]
                  : []
          ).includes(key),
      )
    )
      throw new ApplicationError("RF_INVALID_INPUT", 400, "The query is invalid.");
    if (resource === "courses" && request.method === "GET") {
      const catalog = publicLearningContext();
      if (!action.length)
        return Response.json(await catalog.list(Object.fromEntries(params)), {
          headers: privateHeaders(requestId),
        });
      if (action.length === 1) return send(await catalog.find(action[0]));
    }
    const { actor, config, service, admin, links } = await privateLearningContext();
    requireSameOrigin(request, config.appOrigin);
    const body = () => readJsonBody(request, z.unknown(), 32768);
    if (resource === "plans") {
      if (!action.length && request.method === "GET")
        return Response.json(await service.list(actor, params.get("cursor") || undefined), {
          headers: privateHeaders(requestId),
        });
      if (!action.length && request.method === "POST")
        return send(
          await service.plan(actor, await body(), request.headers.get("idempotency-key")),
          202,
        );
      if (action.length === 1 && request.method === "GET")
        return send(await service.find(actor, action[0]));
      if (action.length === 3 && action[1] === "steps" && request.method === "PATCH")
        return send(await service.stepProgress(actor, action[0], action[2], await body()));
      if (
        action.length === 4 &&
        action[1] === "steps" &&
        action[3] === "practice" &&
        request.method === "POST"
      )
        return send(await service.practice(actor, action[0], action[2], await body()), 201);
      if (action.length === 3 && action[1] === "practice" && request.method === "DELETE")
        return send(await service.removePractice(actor, action[0], action[2], await body()));
    }
    if (resource === "progress") {
      if (!action.length && request.method === "GET") return send(await service.progress(actor));
      if (action.length === 2 && action[0] === "courses" && request.method === "PATCH")
        return send(await service.courseProgress(actor, action[1], await body()));
    }
    if (resource === "admin") {
      if (action.join("/") === "link-checks" && request.method === "GET")
        return send(await links.list(actor, Object.fromEntries(params)));
      if (action.join("/") === "link-checks/resume" && request.method === "POST") {
        await links.resume(actor, await body());
        return send({ updated: true });
      }
      if (!action.length && request.method === "GET") return send(await admin.bank(actor));
      if (!action.length && request.method === "POST")
        return send(await admin.create(actor, await body()), 201);
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
      if (action.length === 1 && request.method === "PATCH")
        return send(await admin.revise(actor, action[0], await body()));
      if (action.length >= 2 && action[1] === "translations" && request.method === "POST") {
        // POST courses/:id/translations saves; POST courses/:id/translations/remove deletes.
        if (action.length === 2) {
          await admin.translate(actor, action[0], await body());
          return send({ translated: true });
        }
        if (action.length === 3 && action[2] === "remove") {
          await admin.removeTranslation(actor, action[0], await body());
          return send({ removed: true });
        }
      }
      if (action.length === 2 && action[1] === "transition" && request.method === "POST") {
        await admin.transition(actor, action[0], await body());
        return send({ updated: true });
      }
    }
    throw new ApplicationError("RF_NOT_FOUND", 404, "The resource is unavailable.");
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
