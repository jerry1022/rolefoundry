import { z } from "zod";

import { ApplicationError } from "./errors";
export function requireSameOrigin(request: Request, origin: string) {
  if (!["GET", "HEAD"].includes(request.method) && request.headers.get("origin") !== origin)
    throw new ApplicationError("RF_ORIGIN", 403, "The request origin is not permitted.");
}
export async function readJsonBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const invalid = () => new ApplicationError("RF_INVALID_INPUT", 400, "The request is invalid.");
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json")
    throw invalid();
  const reader = request.body?.getReader();
  if (!reader) throw invalid();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        throw new ApplicationError("RF_TOO_LARGE", 413, "The request is too large.");
      }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const result = schema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    if (!result.success) throw invalid();
    return result.data;
  } catch (error) {
    if (error instanceof ApplicationError) throw error;
    throw invalid();
  }
}
export function privateHeaders(requestId: string) {
  return { "Cache-Control": "no-store", Vary: "Cookie", "X-Request-Id": requestId };
}
export function errorResponse(error: unknown, requestId: string) {
  const failure =
    error instanceof ApplicationError
      ? error
      : new ApplicationError("RF_UNAVAILABLE", 503, "The service is temporarily unavailable.");
  return Response.json(
    { error: { code: failure.code, message: failure.message, requestId } },
    { status: failure.status, headers: privateHeaders(requestId) },
  );
}
