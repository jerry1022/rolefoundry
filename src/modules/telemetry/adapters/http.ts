import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import type { MetricsService } from "../service";
import { metricsContentType } from "../metrics";
export function metricsHttp(
  service: Pick<MetricsService, "read">,
  token: string,
  signal: AbortSignal,
) {
  if (!/^[0-9a-f]{64}$/.test(token)) throw Error("Invalid metrics token");
  const expected = Buffer.from(`Bearer ${token}`);
  const server = createServer(
    { maxHeaderSize: 8192, requestTimeout: 6000, headersTimeout: 5000, keepAliveTimeout: 1000 },
    async (request, response) => {
      const supplied = Buffer.from(
        typeof request.headers.authorization === "string" ? request.headers.authorization : "",
      );
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("X-Content-Type-Options", "nosniff");
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
        response.writeHead(401, { "WWW-Authenticate": "Bearer" });
        response.end("Unauthorized\n");
        return;
      }
      if (request.method !== "GET") {
        response.writeHead(405, { Allow: "GET" });
        response.end("Method not allowed\n");
        return;
      }
      if (request.url !== "/metrics") {
        response.writeHead(404);
        response.end("Not found\n");
        return;
      }
      try {
        const body = await service.read(signal);
        response.writeHead(200, { "Content-Type": metricsContentType });
        response.end(body);
      } catch {
        response.writeHead(503, { "Content-Type": metricsContentType });
        response.end("# TYPE rolefoundry_exporter_up gauge\nrolefoundry_exporter_up 0\n# EOF\n");
      }
    },
  );
  server.maxConnections = 32;
  return server;
}
