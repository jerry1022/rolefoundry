import "server-only";
import { z } from "zod";
import { resumeContext } from "./server";
import { ApplicationError } from "../platform/errors";
import { errorResponse, privateHeaders, requireSameOrigin, readJsonBody } from "../platform/http";
import { resumeLimits } from "./model";
async function readBytes(request: Request, signal: AbortSignal) {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > resumeLimits.sourceBytes))
    throw new ApplicationError("RF_INVALID_INPUT", 400, "The file exceeds the upload limit.");
  const reader = request.body?.getReader();
  if (!reader) throw new ApplicationError("RF_INVALID_INPUT", 400, "A resume file is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > resumeLimits.sourceBytes) {
        await reader.cancel();
        throw new ApplicationError("RF_INVALID_INPUT", 400, "The file exceeds the upload limit.");
      }
      chunks.push(next.value);
    }
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
  signal.throwIfAborted();
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
export async function resumeHttp(
  request: Request,
  resource: "documents" | "versions" | "proposals" | "exports" | "downloads",
  action: string[],
) {
  const requestId = crypto.randomUUID(),
    send = (data: unknown, status = 200) =>
      Response.json({ data }, { status, headers: privateHeaders(requestId) });
  try {
    const query = new URL(request.url).searchParams;
    if (
      [...query.keys()].some(
        (key) =>
          key !== "cursor" ||
          resource !== "documents" ||
          action.length ||
          query.getAll(key).length !== 1,
      )
    )
      throw new ApplicationError("RF_INVALID_INPUT", 400, "The query is invalid.");
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30000)]),
      { actor, config, service } = await resumeContext(signal);
    requireSameOrigin(request, config.appOrigin);
    const body = () => readJsonBody(request, z.unknown(), 400000),
      key = () => request.headers.get("idempotency-key");
    if (resource === "documents") {
      if (!action.length && request.method === "GET")
        return Response.json(await service.list(actor, query.get("cursor") || undefined), {
          headers: privateHeaders(requestId),
        });
      if (action.join("/") === "upload-intents" && request.method === "POST")
        return send(await service.intent(actor, await body(), key()), 201);
      if (action.join("/") === "paste" && request.method === "POST")
        return send(await service.paste(actor, await body(), key()), 202);
      if (action.length === 1 && request.method === "GET")
        return send(await service.find(actor, action[0]));
      if (action.length === 1 && request.method === "DELETE")
        return send(await service.remove(actor, action[0], await body()));
      if (action.length === 2 && action[1] === "source" && request.method === "PUT")
        return send(
          await service.upload(
            actor,
            action[0],
            request.headers.get("x-upload-token"),
            request.headers.get("content-type"),
            await readBytes(request, signal),
            signal,
          ),
        );
      if (action.length === 2 && action[1] === "parse" && request.method === "POST")
        return send(await service.retryParse(actor, action[0], await body(), key()), 202);
      if (action.length === 2 && action[1] === "confirm" && request.method === "POST")
        return send(await service.confirm(actor, action[0], await body()));
      if (action.length === 2 && action[1] === "revisions" && request.method === "POST")
        return send(await service.revise(actor, action[0], await body(), key()), 202);
      if (action.length === 2 && action[1] === "exports" && request.method === "POST")
        return send(await service.export(actor, action[0], await body(), key()), 202);
    }
    if (resource === "versions" && action.length === 1 && request.method === "GET")
      return send(await service.version(actor, action[0]));
    if (resource === "proposals") {
      if (action.length === 1 && request.method === "GET")
        return send(await service.proposal(actor, action[0]));
      if (action.length === 2 && action[1] === "accept" && request.method === "POST")
        return send(await service.accept(actor, action[0], await body()));
    }
    if (
      resource === "exports" &&
      action.length === 2 &&
      action[1] === "download-intents" &&
      request.method === "POST"
    )
      return send(await service.downloadIntent(actor, action[0]), 201);
    if (resource === "downloads" && action.length === 1 && request.method === "GET") {
      const result = await service.download(actor, action[0], signal);
      return new Response(new Uint8Array(result.bytes).buffer, {
        headers: {
          ...privateHeaders(requestId),
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${result.filename}"`,
          "Content-Length": String(result.bytes.length),
        },
      });
    }
    throw new ApplicationError("RF_NOT_FOUND", 404, "The resume resource is unavailable.");
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
