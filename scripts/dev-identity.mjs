import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
const env = JSON.parse(await readFile(".local/identity-env.json", "utf8"));
if (!["127.0.0.1", "localhost"].includes(new URL(env.API_URL).hostname))
  throw new Error("This helper only runs the local identity stack.");
const port = process.env.IDENTITY_DEV_PORT || "3200";
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", port],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      ROLEFOUNDRY_IDENTITY_ENABLED: "true",
      SUPABASE_URL: env.API_URL,
      SUPABASE_ANON_KEY: env.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY,
      ROLEFOUNDRY_APP_ORIGIN: `http://127.0.0.1:${port}`,
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("close", (code) => {
  process.exitCode = code || 0;
});
