import "server-only";
import { identityContext } from "../identity/server";
import { ApplicationError } from "../platform/errors";
import { errorResponse, privateHeaders, readJsonBody, requireSameOrigin } from "../platform/http";
import { z } from "zod";
import { RecipientAdminService } from "./admin";
import { SupabaseRecipientStore } from "./adapters/supabase";

/** `/api/v1/identity/admin/ai-recipients`: list, approve (POST) or revoke (DELETE). */
export async function recipientAdminHttp(request: Request) {
  const requestId = crypto.randomUUID();
  const headers = privateHeaders(requestId);
  try {
    const { config, client, service: identity } = await identityContext();
    requireSameOrigin(request, config.appOrigin);
    if (new URL(request.url).searchParams.size)
      throw new ApplicationError("RF_INVALID_INPUT", 400, "The request is invalid.");
    await identity.currentActor();
    const service = new RecipientAdminService(new SupabaseRecipientStore(client));
    if (request.method === "GET") return Response.json({ data: await service.list() }, { headers });
    const body = await readJsonBody(request, z.unknown(), 4096);
    if (request.method === "POST") {
      await service.approve(body);
      return Response.json({ data: { approved: true } }, { status: 201, headers });
    }
    if (request.method === "DELETE") {
      await service.revoke(body);
      return Response.json({ data: { revoked: true } }, { headers });
    }
    throw new ApplicationError("RF_NOT_FOUND", 404, "The resource is unavailable.");
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
