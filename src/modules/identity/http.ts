import "server-only";
import { z } from "zod";
import { databaseError, featureSchema, IdentityError } from "./core";
import { identityConfig, identityContext } from "./server";

const email = z
  .email()
  .max(254)
  .transform((value) => value.trim().toLowerCase());
const signin = z.object({ email }).strict();
const verify = z.object({ email, code: z.string().regex(/^\d{6,10}$/) }).strict();
const consent = z
  .object({ purpose: featureSchema, policyVersion: z.string().min(1).max(100) })
  .strict();
const revoke = z.object({ purpose: featureSchema }).strict();
const invite = z.object({ email, expiresAt: z.iso.datetime({ offset: true }) }).strict();
const quota = z
  .object({
    feature: featureSchema,
    limit: z.number().int().min(0).max(10000),
    effectiveFrom: z.iso.datetime({ offset: true }),
  })
  .strict();
const refund = z.object({ taskId: z.uuid(), reason: z.string().trim().min(1).max(1000) }).strict();

async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json")
    throw new IdentityError("RF_INVALID_INPUT");
  const reader = request.body?.getReader();
  if (!reader) throw new IdentityError("RF_INVALID_INPUT");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        throw new IdentityError("RF_TOO_LARGE");
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
    if (!result.success) throw new IdentityError("RF_INVALID_INPUT");
    return result.data;
  } catch (error) {
    if (error instanceof IdentityError) throw error;
    throw new IdentityError("RF_INVALID_INPUT");
  }
}
export async function identityHttp(request: Request, action: string[]) {
  const requestId = crypto.randomUUID();
  const headers = { "Cache-Control": "no-store", Vary: "Cookie", "X-Request-Id": requestId };
  const success = (data: unknown, status = 200) => Response.json({ data }, { status, headers });
  try {
    const config = identityConfig();
    if (
      !["GET", "HEAD"].includes(request.method) &&
      request.headers.get("origin") !== config.appOrigin
    )
      throw new IdentityError("RF_ORIGIN");
    const ctx = await identityContext();
    const route = `${request.method} ${action.join("/")}`;
    if (route === "GET policies") return success(await ctx.service.policies());
    if (route === "POST signin") {
      const input = await body(request, signin);
      const { data, error } = await ctx
        .privileged()
        .rpc("identity_otp_admission", { p_email: input.email });
      if (error) throw databaseError(error);
      if (data === true) {
        const sent = await ctx.client.auth.signInWithOtp({
          email: input.email,
          options: { shouldCreateUser: true },
        });
        if (sent.error?.status && sent.error.status >= 500)
          throw new IdentityError("RF_UNAVAILABLE");
      }
      return success(
        { message: "If this address is eligible, a sign-in code will arrive shortly." },
        202,
      );
    }
    if (route === "POST verify") {
      const input = await body(request, verify);
      const verified = await ctx.client.auth.verifyOtp({
        email: input.email,
        token: input.code,
        type: "email",
      });
      if (verified.error)
        throw new IdentityError(
          verified.error.status && verified.error.status >= 500
            ? "RF_UNAVAILABLE"
            : "RF_UNAUTHORIZED",
        );
      try {
        return success(await ctx.service.activate());
      } catch (error) {
        await ctx.client.auth.signOut({ scope: "local" });
        throw error;
      }
    }
    if (route === "POST signout") {
      await body(request, z.object({}).strict());
      const { error } = await ctx.client.auth.signOut({ scope: "local" });
      if (error && error.name !== "AuthSessionMissingError" && error.status !== 401)
        throw new IdentityError("RF_UNAVAILABLE");
      return success({ signedOut: true });
    }
    const actor = await ctx.service.currentActor();
    if (route === "GET session") return success(actor);
    if (route === "GET consents") return success(await ctx.service.consents(actor));
    if (route === "GET usage") return success(await ctx.service.usage(actor));
    if (route === "POST consents") {
      const input = await body(request, consent);
      return success(await ctx.service.grantConsent(actor, input.purpose, input.policyVersion));
    }
    if (route === "DELETE consents") {
      const input = await body(request, revoke);
      await ctx.service.revokeConsent(actor, input.purpose);
      return success({ revoked: true });
    }
    if (route === "POST admin/invitations") {
      const input = await body(request, invite);
      return success(await ctx.service.invite(actor, input.email, input.expiresAt), 201);
    }
    if (route === "POST admin/quota-policies") {
      const input = await body(request, quota);
      return success(
        await ctx.service.setQuota(actor, input.feature, input.limit, input.effectiveFrom),
        201,
      );
    }
    if (route === "POST admin/refunds") {
      const input = await body(request, refund);
      await ctx.service.refund(actor, input.taskId, input.reason);
      return success({ refunded: true });
    }
    if (request.method === "GET" && action[0] === "tasks" && action.length === 2) {
      if (!z.uuid().safeParse(action[1]).success) throw new IdentityError("RF_NOT_FOUND");
      return success(await ctx.service.task(actor, action[1]));
    }
    throw new IdentityError("RF_NOT_FOUND");
  } catch (error) {
    const failure = error instanceof IdentityError ? error : new IdentityError("RF_UNAVAILABLE");
    return Response.json(
      { error: { code: failure.code, message: failure.message, requestId } },
      { status: failure.status, headers },
    );
  }
}
