import "server-only";
import { z } from "zod";
import { accountDataContext } from "./server";
import { ApplicationError } from "../platform/errors";
import { errorResponse, privateHeaders, readJsonBody, requireSameOrigin } from "../platform/http";
export async function accountDataHttp(request: Request, action: string[]) {
  const requestId = crypto.randomUUID(),
    headers = privateHeaders(requestId);
  try {
    const { actor, service, origin, storage, archive } = await accountDataContext();
    requireSameOrigin(request, origin);
    const query = new URL(request.url).searchParams;
    if (
      [...query.keys()].some(
        (key) =>
          action.length !== 0 ||
          request.method !== "GET" ||
          key !== "cursor" ||
          query.getAll(key).length !== 1,
      )
    )
      throw new ApplicationError("RF_INVALID_INPUT", 400, "The export query is invalid.");
    if (action.length === 0 && request.method === "GET")
      return Response.json(await service.list(actor, query.get("cursor") ?? undefined), {
        headers,
      });
    if (action.length === 0 && request.method === "POST") {
      await readJsonBody(request, z.object({}).strict(), 256);
      return Response.json(
        { data: await service.request(actor, request.headers.get("Idempotency-Key")) },
        { status: 202, headers },
      );
    }
    if (action.length === 1 && request.method === "DELETE") {
      await readJsonBody(request, z.object({}).strict(), 256);
      return Response.json({ data: await service.remove(actor, action[0]) }, { headers });
    }
    if (action.length === 2 && action[1] === "download" && request.method === "GET") {
      const access = await service.access(actor, action[0]);
      const bytes = await storage.get(access.key, request.signal);
      if (bytes.byteLength !== access.byteCount || !archive.verify(bytes, access.sha256))
        throw new ApplicationError(
          "RF_UNAVAILABLE",
          503,
          "The private archive failed its integrity check.",
        );
      const current = await service.access(actor, action[0]);
      if (current.key !== access.key || current.sha256 !== access.sha256)
        throw new ApplicationError(
          "RF_NOT_FOUND",
          404,
          "The private archive is no longer available.",
        );
      // Streaming avoids buffering the response a second time in the web adapter.
      return new Response(new Blob([Buffer.from(bytes)]).stream(), {
        headers: {
          ...headers,
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="rolefoundry-account-${action[0]}.zip"`,
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    throw new ApplicationError("RF_NOT_FOUND", 404, "The export resource is unavailable.");
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
