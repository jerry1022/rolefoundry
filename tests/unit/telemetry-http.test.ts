import { afterEach, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { metricsHttp } from "../../src/modules/telemetry/adapters/http";
const servers: Server[] = [];
const token = "a".repeat(64);
async function start(read = vi.fn(async () => "rolefoundry_exporter_up 1\n# EOF\n")) {
  const controller = new AbortController(),
    server = metricsHttp({ read }, token, controller.signal);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Missing test listener");
  return { read, origin: `http://127.0.0.1:${address.port}`, controller };
}
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
it("requires the exact bearer token before any database access and rejects cookie authentication", async () => {
  const { origin, read } = await start();
  const attempts: Record<string, string>[] = [
    {},
    { Cookie: `metrics=${token}` },
    { Authorization: `Bearer ${"b".repeat(64)}` },
    { Authorization: "Bearer short" },
  ];
  for (const headers of attempts) {
    const response = await fetch(`${origin}/metrics`, { headers });
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).not.toContain(token);
  }
  expect(read).not.toHaveBeenCalled();
});
it("serves only GET /metrics with explicit OpenMetrics content type", async () => {
  const { origin, read, controller } = await start(),
    headers = { Authorization: `Bearer ${token}` };
  expect((await fetch(`${origin}/metrics?private=secret`, { headers })).status).toBe(404);
  expect((await fetch(`${origin}/metrics`, { headers, method: "POST" })).status).toBe(405);
  expect(read).not.toHaveBeenCalled();
  const response = await fetch(`${origin}/metrics`, { headers });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain(
    "application/openmetrics-text; version=1.0.0",
  );
  expect(await response.text()).toBe("rolefoundry_exporter_up 1\n# EOF\n");
  expect(read).toHaveBeenCalledExactlyOnceWith(controller.signal);
});
it("returns a redacted unavailable signal instead of internal storage errors", async () => {
  const { origin } = await start(
    vi.fn(async () => {
      throw Error("private service-role URL and resume");
    }),
  );
  const response = await fetch(`${origin}/metrics`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status).toBe(503);
  expect(await response.text()).toBe(
    "# TYPE rolefoundry_exporter_up gauge\nrolefoundry_exporter_up 0\n# EOF\n",
  );
});
