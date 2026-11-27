// Owned rehearsal receiver only. Never forwards notifications to people or external services.
import { createServer } from "node:http";
const counts = { firing: 0, resolved: 0 };
createServer({ maxHeaderSize: 8192, requestTimeout: 5000 }, async (request, response) => {
  if (request.method === "GET" && request.url === "/received") {
    response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify(counts));
    return;
  }
  if (request.method !== "POST" || request.url !== "/alerts") {
    response.writeHead(404).end();
    return;
  }
  let body = "";
  try {
    for await (const chunk of request) {
      body += chunk;
      if (Buffer.byteLength(body) > 65536) {
        response.writeHead(413).end();
        request.destroy();
        return;
      }
    }
    const input = JSON.parse(body);
    if (!Array.isArray(input.alerts)) throw Error("Invalid notification");
    for (const alert of input.alerts)
      if (
        alert.labels?.alertname === "RoleFoundryRehearsalExporterDown" &&
        Object.hasOwn(counts, alert.status)
      )
        counts[alert.status]++;
    response.writeHead(204).end();
  } catch {
    response.writeHead(400).end();
  }
}).listen(9099, "0.0.0.0");
