import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

export function command(program, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data;
    });
    child.stderr.on("data", (data) => {
      stderr += data;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}
const cli = "node_modules/.bin/supabase";
const action = process.argv[2] || "start";
await mkdir(".local", { recursive: true });
if (action === "start") {
  console.log(
    "Starting the local RoleFoundry identity stack (Docker); credentials are not printed.",
  );
  const result = await command(cli, [
    "start",
    "--exclude",
    "realtime,storage-api,imgproxy,studio,edge-runtime,logflare,vector,supavisor,postgres-meta",
    "--yes",
    "--agent",
    "no",
  ]);
  await writeFile(".local/identity-start.log", result.stdout + result.stderr, { mode: 0o600 });
  if (result.code)
    throw new Error("Local identity startup failed. Inspect .local/identity-start.log privately.");
  const status = await command(cli, ["status", "--output", "json"]);
  if (status.code) throw new Error("Local identity status is unavailable.");
  const env = JSON.parse(status.stdout);
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(env.API_URL))
    throw new Error("Refusing a non-local test stack.");
  await writeFile(".local/identity-env.json", JSON.stringify(env), { mode: 0o600 });
  console.log(
    "Local identity stack ready. Test credentials are stored only in ignored .local/identity-env.json.",
  );
} else if (action === "stop") {
  const result = await command(cli, ["stop", "--yes", "--agent", "no"]);
  if (result.code) throw new Error("Unable to stop the local identity stack.");
  console.log("Stopped the local RoleFoundry identity stack; volumes are retained.");
} else throw new Error("Expected start or stop.");
