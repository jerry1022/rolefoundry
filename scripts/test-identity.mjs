import { spawn } from "node:child_process";
import { cp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";

const env = JSON.parse(await readFile(".local/identity-env.json", "utf8"));
for (const name of ["API_URL", "DB_URL"]) {
  if (!["127.0.0.1", "localhost"].includes(new URL(env[name]).hostname))
    throw new Error("Identity tests only accept the local fixture stack.");
}
const port = Number(process.env.IDENTITY_TEST_PORT || "3200");
await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(port, "127.0.0.1", () => probe.close(resolve));
});
const origin = `http://127.0.0.1:${port}`;
const runtimeEnv = {
  ...process.env,
  STATIC_EXPORT: "0",
  NEXT_PUBLIC_BASE_PATH: "",
  ROLEFOUNDRY_IDENTITY_ENABLED: "true",
  SUPABASE_URL: env.API_URL,
  SUPABASE_ANON_KEY: env.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY,
  ROLEFOUNDRY_APP_ORIGIN: origin,
  HOSTNAME: "127.0.0.1",
  PORT: String(port),
};
console.log("Building the production identity server for integration tests.");
let buildLog = "";
const buildCode = await new Promise((resolve, reject) => {
  const build = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
    env: runtimeEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  build.stdout.on("data", (data) => {
    buildLog += data;
  });
  build.stderr.on("data", (data) => {
    buildLog += data;
  });
  build.on("error", reject);
  build.on("close", resolve);
});
await writeFile(".local/identity-build.log", buildLog, { mode: 0o600 });
if (buildCode)
  throw new Error("Identity build failed; inspect the ignored identity-build.log privately.");
await cp("public", ".next/standalone/public", { recursive: true });
await cp(".next/static", ".next/standalone/.next/static", { recursive: true });
const server = spawn(process.execPath, [".next/standalone/server.js"], {
  detached: process.platform !== "win32",
  stdio: ["ignore", "pipe", "pipe"],
  env: runtimeEnv,
});
let log = "";
server.stdout.on("data", (chunk) => {
  log += chunk;
});
server.stderr.on("data", (chunk) => {
  log += chunk;
});
try {
  let ready = false;
  for (let count = 0; count < 120; count++) {
    if (server.exitCode !== null)
      throw new Error("Identity test server exited before becoming ready.");
    try {
      const response = await fetch(`${origin}/api/v1/identity/policies`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* owned server is still starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Identity test server did not become ready.");
  const code = await new Promise((resolve, reject) => {
    const tests = spawn(
      process.execPath,
      [
        "node_modules/vitest/vitest.mjs",
        "run",
        "--config",
        "vitest.identity.config.ts",
        ...process.argv.slice(2),
      ],
      { stdio: "inherit", env: { ...process.env, ROLEFOUNDRY_TEST_ORIGIN: origin } },
    );
    tests.on("error", reject);
    tests.on("close", resolve);
  });
  process.exitCode = code || 0;
} finally {
  if (server.pid) {
    try {
      process.platform === "win32" ? server.kill("SIGTERM") : process.kill(-server.pid, "SIGTERM");
    } catch {
      /* already stopped */
    }
  }
  // This is an ignored local log, not a CI artifact: no provider credentials are exposed.
  await writeFile(".local/identity-web.log", log, { mode: 0o600 });
}
