import "server-only";
import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { ApiFamily } from "./model";
import { HttpObserver } from "./observer";
import { SupabaseTelemetryStore } from "./adapters/supabase";
let observer: HttpObserver | undefined;
/** Explicitly enabled server-only composition. Missing telemetry never changes business behavior. */
export function observeApi(family: ApiFamily, request: Request, work: () => Promise<Response>) {
  if (process.env.ROLEFOUNDRY_TELEMETRY_ENABLED !== "true") return work();
  try {
    if (!observer) {
      const url = process.env.SUPABASE_URL,
        key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (url && key) {
        const client = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        observer = new HttpObserver(new SupabaseTelemetryStore(client), {
          now: () => performance.now(),
          requestId: () => crypto.randomUUID(),
          schedule: (callback) => after(callback),
          log: (event) => console.log(JSON.stringify(event)),
        });
      }
    }
  } catch {
    /* Optional telemetry composition cannot retry a business operation. */
  }
  return observer ? observer.observe(family, request.method, work) : work();
}
