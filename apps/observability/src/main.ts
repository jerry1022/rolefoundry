import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { SupabaseTelemetryStore } from "../../../src/modules/telemetry/adapters/supabase";
import { MetricsService } from "../../../src/modules/telemetry/service";
import { metricsHttp } from "../../../src/modules/telemetry/adapters/http";
const config = z
  .object({
    url: z.url(),
    key: z.string().min(1),
    token: z.string().regex(/^[0-9a-f]{64}$/),
    host: z.enum(["127.0.0.1", "0.0.0.0"]),
    port: z.coerce.number().int().min(0).max(65535),
    privateNetwork: z.boolean(),
  })
  .safeParse({
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    token: process.env.ROLEFOUNDRY_METRICS_TOKEN,
    host: process.env.ROLEFOUNDRY_METRICS_HOST || "127.0.0.1",
    port: process.env.ROLEFOUNDRY_METRICS_PORT || 9464,
    privateNetwork: process.env.ROLEFOUNDRY_METRICS_PRIVATE_NETWORK === "true",
  });
if (!config.success)
  throw Error("Metrics configuration is missing or invalid; no credentials are printed.");
const target = new URL(config.data.url);
if (target.username || target.password || target.search || target.hash)
  throw Error("Metrics storage URL must not contain credentials, query parameters or fragments.");
if (
  target.protocol !== "https:" &&
  !(
    target.protocol === "http:" &&
    (["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || config.data.privateNetwork)
  )
)
  throw Error("Metrics storage requires HTTPS except for configured private networking.");
const client = createClient(config.data.url, config.data.key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const controller = new AbortController(),
  server = metricsHttp(
    new MetricsService(new SupabaseTelemetryStore(client)),
    config.data.token,
    controller.signal,
  );
for (const event of ["SIGINT", "SIGTERM"] as const)
  process.on(event, () => {
    controller.abort();
    server.close();
    server.closeAllConnections();
  });
server.on("error", () => {
  console.error(JSON.stringify({ event: "metrics.unavailable", code: "RF_UNAVAILABLE" }));
  process.exitCode = 1;
});
server.listen(config.data.port, config.data.host, () => {
  const address = server.address();
  console.log(
    JSON.stringify({
      event: "metrics.listening",
      port: typeof address === "object" && address ? address.port : config.data.port,
    }),
  );
});
