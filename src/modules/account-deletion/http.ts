import "server-only";
import { z } from "zod";
import { deletionContext } from "./server";
import { deletionRequestSchema, deletionReceiptSchema, resumeReasonSchema } from "./model";
import { ApplicationError } from "../platform/errors";
import { privateHeaders, errorResponse, readJsonBody, requireSameOrigin } from "../platform/http";
export async function deletionHttp(request: Request, action: string[], admin = false) {
  const requestId = crypto.randomUUID(),
    headers = privateHeaders(requestId);
  try {
    const { identity, service } = await deletionContext();
    requireSameOrigin(request, identity.config.appOrigin);
    if (new URL(request.url).search)
      throw new ApplicationError(
        "RF_INVALID_INPUT",
        400,
        "Deletion receipts are accepted only in a private request body.",
      );
    const send = (data: unknown, status = 200) => Response.json({ data }, { status, headers });
    if (!admin && request.method === "POST" && action.length === 1 && action[0] === "status")
      return send(await service.status(await readJsonBody(request, deletionReceiptSchema, 512)));
    if (!admin && request.method === "POST" && action.length === 0) {
      const input = await readJsonBody(request, deletionRequestSchema, 512);
      // A lost acceptance response can be recovered using the original private receipt even after sign-out.
      let existing;
      try {
        existing = await service.status({ id: input.id, secret: input.secret });
      } catch (error) {
        if (!(error instanceof ApplicationError && error.status === 404)) throw error;
      }
      if (existing) return send(existing, 202);
      const actor = await identity.service.currentActor();
      const result = await service.request(actor, input);
      try {
        await identity.client.auth.signOut({ scope: "global" });
      } catch {
        /* Acceptance is durable even when the directory cannot revoke sessions yet. */
      }
      return send(result, 202);
    }
    if (admin) {
      const actor = await identity.service.currentActor();
      if (request.method === "GET" && action.length === 2 && action[0] === "tasks")
        return send(await service.find(actor, action[1]));
      if (request.method === "POST" && action.length === 2 && action[1] === "resume") {
        const input = await readJsonBody(
          request,
          z.object({ reason: resumeReasonSchema }).strict(),
          256,
        );
        return send(await service.resume(actor, action[0], input.reason), 202);
      }
    }
    throw new ApplicationError(
      "RF_NOT_FOUND",
      404,
      "The account deletion operation is unavailable.",
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
