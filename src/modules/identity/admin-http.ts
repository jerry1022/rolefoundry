import "server-only";
import { z } from "zod";
import { identityAdminDirectoryContext } from "./admin-server";
import { IdentityError } from "./core";
import { privateHeaders, errorResponse, readJsonBody, requireSameOrigin } from "../platform/http";
export async function identityAdminDirectoryHttp(request: Request, action: string[]) {
  const requestId = crypto.randomUUID(),
    headers = privateHeaders(requestId);
  try {
    const { actor, config, directory } = await identityAdminDirectoryContext();
    requireSameOrigin(request, config.appOrigin);
    const query = new URL(request.url).searchParams;
    if (
      [...query.keys()].some((key) => key !== "cursor" || query.getAll(key).length !== 1) ||
      (request.method !== "GET" && query.size)
    )
      throw new IdentityError("RF_INVALID_INPUT");
    if (request.method === "GET" && action.length === 2 && action[1] === "invitations")
      return Response.json(await directory.invitations(actor, query.get("cursor") ?? undefined), {
        headers,
      });
    if (request.method === "GET" && action.length === 2 && action[1] === "quota-policies")
      return Response.json(await directory.quotaPolicies(actor, query.get("cursor") ?? undefined), {
        headers,
      });
    if (
      request.method === "POST" &&
      action.length === 4 &&
      action[1] === "invitations" &&
      action[3] === "revoke"
    ) {
      await readJsonBody(request, z.object({}).strict(), 128);
      await directory.revokeInvitation(actor, action[2]);
      return Response.json({ data: { revoked: true } }, { headers });
    }
    throw new IdentityError("RF_NOT_FOUND");
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
