import "server-only";
import { identityContext } from "../identity/server";
import { ApplicationError } from "../platform/errors";
import { errorResponse, privateHeaders, readJsonBody, requireSameOrigin } from "../platform/http";
import { z } from "zod";
import { RecipientAdminService } from "./admin";
import { SupabaseRecipientStore, SupabaseUsageReportStore } from "./adapters/supabase";
import { UsageReportService } from "./usage";

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

/** `GET /api/v1/identity/admin/ai-usage?days=1|7|30`: content-free usage and estimated spend. */
export async function usageReportHttp(request: Request) {
  const requestId = crypto.randomUUID();
  const headers = privateHeaders(requestId);
  try {
    const { config, client, service: identity } = await identityContext();
    requireSameOrigin(request, config.appOrigin);
    if (request.method !== "GET")
      throw new ApplicationError("RF_NOT_FOUND", 404, "The resource is unavailable.");
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some((key) => key !== "days"))
      throw new ApplicationError("RF_INVALID_INPUT", 400, "The request is invalid.");
    await identity.currentActor();
    const report = await new UsageReportService(new SupabaseUsageReportStore(client)).report(
      params.get("days") ?? undefined,
    );
    return Response.json({ data: report }, { headers });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
