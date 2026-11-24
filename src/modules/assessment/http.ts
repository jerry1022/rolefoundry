import "server-only";
import { z } from "zod";
import { assessmentContext } from "./server";
import { errorResponse, privateHeaders, requireSameOrigin, readJsonBody } from "../platform/http";
import { ApplicationError } from "../platform/errors";
export async function assessmentHttp(
  request: Request,
  resource: "assessment" | "admin" | "tasks",
  action: string[],
) {
  const requestId = crypto.randomUUID();
  const send = (data: unknown, status = 200) =>
    Response.json({ data }, { status, headers: privateHeaders(requestId) });
  try {
    const { actor, config, service, admin, tasks } = await assessmentContext();
    requireSameOrigin(request, config.appOrigin);
    const body = () => readJsonBody(request, z.unknown());
    if (resource === "tasks" && request.method === "GET" && action.length === 1) {
      if (!z.uuid().safeParse(action[0]).success)
        throw new ApplicationError("RF_NOT_FOUND", 404, "The task is unavailable.");
      return send(await tasks.find(action[0]));
    }
    if (resource === "admin") {
      if (!action.length && request.method === "GET") return send(await admin.bank(actor));
      if (action.join("/") === "rubrics" && request.method === "POST")
        return send(await admin.rubric(actor, await body()), 201);
      if (action.join("/") === "questions" && request.method === "POST")
        return send(await admin.question(actor, await body()), 201);
      if (action.length === 3 && action[0] === "questions" && request.method === "POST") {
        if (action[2] === "review") {
          await admin.review(actor, action[1], await body());
          return send({ reviewed: true });
        }
        if (action[2] === "retire") {
          await admin.retire(actor, action[1], await body());
          return send({ retired: true });
        }
        if (action[2] === "translations") {
          await admin.translate(actor, action[1], await body());
          return send({ translated: true });
        }
      }
      if (
        action.length === 4 &&
        action[0] === "questions" &&
        action[2] === "translations" &&
        action[3] === "remove" &&
        request.method === "POST"
      ) {
        await admin.removeTranslation(actor, action[1], await body());
        return send({ removed: true });
      }
    } else if (resource === "assessment") {
      if (!action.length && request.method === "GET") {
        const params = new URL(request.url).searchParams;
        if ([...params.keys()].some((key) => key !== "cursor" || params.getAll(key).length !== 1))
          throw new ApplicationError("RF_INVALID_INPUT", 400, "The query is invalid.");
        return Response.json(await service.list(actor, params.get("cursor") || undefined), {
          headers: privateHeaders(requestId),
        });
      }
      if (!action.length && request.method === "POST")
        return send(await service.start(actor, await body()), 201);
      if (action.length === 1 && request.method === "GET") {
        if (!z.uuid().safeParse(action[0]).success)
          throw new ApplicationError("RF_NOT_FOUND", 404, "The assessment is unavailable.");
        return send(await service.find(actor, action[0]));
      }
      if (action.length === 2 && action[1] === "answers" && request.method === "PATCH")
        return send(await service.save(actor, action[0], await body()));
      if (action.length === 2 && action[1] === "retry" && request.method === "POST") {
        const parsed = await readJsonBody(request, z.object({ previousTaskId: z.uuid() }).strict());
        return send(
          await service.retry(actor, action[0], {
            ...parsed,
            idempotencyKey: request.headers.get("idempotency-key") || "",
          }),
          202,
        );
      }
      if (action.length === 2 && action[1] === "submit" && request.method === "POST") {
        const parsed = await readJsonBody(
          request,
          z.object({ expectedRevision: z.number().int(), answers: z.unknown() }).strict(),
        );
        return send(
          await service.submit(actor, action[0], {
            ...parsed,
            idempotencyKey: request.headers.get("idempotency-key") || "",
          }),
          202,
        );
      }
    }
    throw new ApplicationError("RF_NOT_FOUND", 404, "The resource is unavailable.");
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
