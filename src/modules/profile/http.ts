import "server-only";
import { z } from "zod";
import { errorResponse, privateHeaders, readJsonBody, requireSameOrigin } from "../platform/http";
import { ProfileError } from "./model";
import { profileContext } from "./server";

export async function profileHttp(
  request: Request,
  resource: "profile" | "evidence",
  action: string[],
) {
  const requestId = crypto.randomUUID();
  const send = (data: unknown, status = 200) =>
    Response.json({ data }, { status, headers: privateHeaders(requestId) });
  try {
    const { actor, config, service } = await profileContext();
    requireSameOrigin(request, config.appOrigin);
    if (resource === "profile") {
      if (!action.length && request.method === "GET") return send(await service.read(actor));
      if (!action.length && request.method === "PATCH")
        return send(await service.update(actor, await readJsonBody(request, z.unknown())));
      if (action.join("/") === "import" && request.method === "POST")
        return send(await service.importDemo(actor, await readJsonBody(request, z.unknown())), 201);
    } else {
      if (!action.length && request.method === "GET") {
        const params = new URL(request.url).searchParams;
        if (
          [...params.keys()].some((key) => !["skill", "cursor", "limit"].includes(key)) ||
          [...new Set(params.keys())].some((key) => params.getAll(key).length > 1)
        )
          throw new ProfileError("RF_INVALID_INPUT", 400);
        const page = await service.list(actor, {
          ...(params.has("skill") ? { skill: params.get("skill") } : {}),
          ...(params.has("cursor") ? { cursor: params.get("cursor") } : {}),
          limit: params.has("limit") ? Number(params.get("limit")) : 20,
        });
        return Response.json(page, { headers: privateHeaders(requestId) });
      }
      if (!action.length && request.method === "POST")
        return send(await service.create(actor, await readJsonBody(request, z.unknown())), 201);
      if (action.length === 1) {
        if (!z.uuid().safeParse(action[0]).success) throw new ProfileError("RF_NOT_FOUND", 404);
        if (request.method === "GET") return send(await service.history(actor, action[0]));
        if (request.method === "PATCH")
          return send(
            await service.edit(actor, action[0], await readJsonBody(request, z.unknown())),
          );
        if (request.method === "DELETE")
          return send(
            await service.remove(actor, action[0], await readJsonBody(request, z.unknown())),
          );
      }
    }
    throw new ProfileError("RF_NOT_FOUND", 404);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
