import "server-only";
import { z } from "zod";
import { publicSkillContext, privateSkillContext } from "./server";
import { privateHeaders, errorResponse, requireSameOrigin, readJsonBody } from "../platform/http";
import { ApplicationError } from "../platform/errors";
export async function skillHttp(request: Request, admin: boolean, action: string[]) {
  const requestId = crypto.randomUUID();
  const send = (data: unknown, status = 200) =>
    Response.json({ data }, { status, headers: privateHeaders(requestId) });
  try {
    if (!admin) {
      const service = publicSkillContext();
      const params = new URL(request.url).searchParams;
      const allowed = action.join("/") === "resolve" ? ["term", "locale", "version"] : ["version"];
      if (
        [...params.keys()].some((key) => !allowed.includes(key) || params.getAll(key).length !== 1)
      )
        throw new ApplicationError("RF_INVALID_INPUT", 400, "The query is invalid.");
      if (request.method === "GET" && !action.length)
        return send(
          await service.get(params.has("version") ? Number(params.get("version")) : undefined),
        );
      if (request.method === "GET" && action.join("/") === "resolve")
        return send(
          await service.resolve({
            ...Object.fromEntries(params),
            ...(params.has("version") ? { version: Number(params.get("version")) } : {}),
          }),
        );
    } else {
      const { actor, config, service } = await privateSkillContext();
      requireSameOrigin(request, config.appOrigin);
      const body = () => readJsonBody(request, z.unknown());
      if (request.method === "DELETE" && action.join("/") === "aliases")
        return send(await service.removeAlias(actor, await body()));
      if (request.method === "DELETE" && action.join("/") === "relations")
        return send(await service.removeRelation(actor, await body()));
      if (request.method === "DELETE" && action.join("/") === "tracks")
        return send(await service.removeTrack(actor, await body()));
      if (request.method === "POST" && !action.length)
        return send(await service.create(actor, await body()), 201);
      if (request.method === "PATCH" && action.length === 1)
        return send(await service.update(actor, action[0], await body()));
      if (request.method === "POST" && action.join("/") === "aliases")
        return send(await service.alias(actor, await body()), 201);
      if (request.method === "POST" && action.join("/") === "relations")
        return send(await service.relation(actor, await body()), 201);
      if (request.method === "POST" && action.join("/") === "tracks")
        return send(await service.track(actor, await body()));
      if (request.method === "POST" && action.join("/") === "merge")
        return send(await service.merge(actor, await body()));
    }
    throw new ApplicationError("RF_NOT_FOUND", 404, "The resource is unavailable.");
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
