import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ApplicationError } from "./errors";
/** Anonymous published reads need no session, service key or private profile. */
export function publicDatabase() {
  const config = z
    .object({ url: z.url(), key: z.string().min(1) })
    .safeParse({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY });
  if (!config.success)
    throw new ApplicationError("RF_NOT_CONFIGURED", 503, "The public catalog is not configured.");
  const url = new URL(config.data.url);
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  )
    throw new ApplicationError("RF_NOT_CONFIGURED", 503, "The public catalog is not configured.");
  return createClient(config.data.url, config.data.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
