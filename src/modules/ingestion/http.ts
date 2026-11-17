import "server-only";
import { z } from "zod";
import { ingestionContext } from "./server";
import { ApplicationError } from "../platform/errors";
import { readJsonBody, requireSameOrigin, privateHeaders, errorResponse } from "../platform/http";
export async function ingestionHttp(request: Request, action: string[]) {
  const requestId = crypto.randomUUID(),
    headers = privateHeaders(requestId),
    send = (data: unknown, status = 200) => Response.json({ data }, { headers, status });
  try {
    const query = new URL(request.url).searchParams;
    if (
      [...query.keys()].some(
        (key) =>
          request.method !== "GET" ||
          action.length !== 0 ||
          key !== "cursor" ||
          query.getAll(key).length !== 1,
      )
    )
      throw new ApplicationError("RF_INVALID_INPUT", 400, "The query is invalid.");
    const { actor, config, submission, admin, review, feeds } = await ingestionContext();
    requireSameOrigin(request, config.appOrigin);
    if (!action.length && request.method === "GET")
      return Response.json(await admin.list(actor, query.get("cursor") ?? undefined), { headers });
    if (!action.length && request.method === "POST")
      return send(
        await submission.submit(
          actor,
          await readJsonBody(request, z.unknown(), 4 * 1024 * 1024 + 8192),
          request.headers.get("idempotency-key"),
        ),
        202,
      );
    if (action.join("/") === "feeds" && request.method === "GET")
      return send(await feeds.settings(actor));
    if (action.join("/") === "feed-runs" && request.method === "GET")
      return send(await feeds.list(actor));
    if (action.length === 2 && action[0] === "feeds" && request.method === "PATCH")
      return send(
        await feeds.configure(actor, action[1], await readJsonBody(request, z.unknown(), 8192)),
      );
    if (
      action.length === 3 &&
      action[0] === "feeds" &&
      action[2] === "fetch" &&
      request.method === "POST"
    ) {
      await readJsonBody(request, z.object({}).strict(), 1024);
      return send(
        await feeds.request(actor, action[1], request.headers.get("idempotency-key")),
        202,
      );
    }
    if (action.length === 2 && action[0] === "feed-runs" && request.method === "GET")
      return send(await feeds.find(actor, action[1]));
    if (action.join("/") === "sources" && request.method === "GET")
      return send(await admin.settings(actor));
    if (action.length === 2 && action[0] === "sources" && request.method === "PATCH")
      return send(
        await admin.configure(actor, action[1], await readJsonBody(request, z.unknown())),
      );
    if (action.length === 2 && action[0] === "reviews" && request.method === "GET")
      return send(await review.find(actor, action[1]));
    if (action.length === 3 && action[0] === "reviews" && request.method === "POST") {
      if (action[2] === "rebase")
        return send(
          await review.rebase(actor, action[1], await readJsonBody(request, z.unknown(), 8192)),
        );
      if (action[2] === "decide")
        return send(
          await review.decide(
            actor,
            action[1],
            await readJsonBody(request, z.unknown(), 262144),
            request.headers.get("idempotency-key"),
          ),
        );
    }
    if (action.length === 1 && request.method === "GET")
      return send(await admin.find(actor, action[0]));
    throw new ApplicationError("RF_NOT_FOUND", 404, "The resource is unavailable.");
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
