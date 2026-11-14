import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { IdentityError } from "./core";
import { SupabaseIdentityService } from "./service";

export function identityConfig() {
  if (process.env.ROLEFOUNDRY_IDENTITY_ENABLED !== "true")
    throw new IdentityError("RF_NOT_CONFIGURED");
  const parsed = z
    .object({
      url: z.url(),
      anonKey: z.string().min(1),
      serviceKey: z.string().min(1),
      appOrigin: z.url(),
    })
    .safeParse({
      url: process.env.SUPABASE_URL,
      anonKey: process.env.SUPABASE_ANON_KEY,
      serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      appOrigin: process.env.ROLEFOUNDRY_APP_ORIGIN,
    });
  if (!parsed.success) throw new IdentityError("RF_NOT_CONFIGURED");
  const { url, appOrigin } = parsed.data;
  for (const value of [url, appOrigin]) {
    const u = new URL(value);
    if (
      u.protocol !== "https:" &&
      !(u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname))
    )
      throw new IdentityError("RF_NOT_CONFIGURED");
  }
  if (new URL(appOrigin).origin !== appOrigin) throw new IdentityError("RF_NOT_CONFIGURED");
  return parsed.data;
}
export async function identityContext() {
  const config = identityConfig();
  const jar = await cookies();
  const client = createServerClient(config.url, config.anonKey, {
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: config.appOrigin.startsWith("https:"),
      path: "/",
    },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => {
        for (const { name, value, options } of values) jar.set(name, value, options);
      },
    },
  });
  const privileged = () =>
    createClient(config.url, config.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  return { config, client, privileged, service: new SupabaseIdentityService(client, privileged) };
}
