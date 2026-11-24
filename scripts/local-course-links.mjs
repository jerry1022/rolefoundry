import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
const env = JSON.parse(await readFile(".local/identity-env.json", "utf8"));
if (!["127.0.0.1", "localhost"].includes(new URL(env.API_URL).hostname))
  throw Error("Local course checks refuse hosted configuration.");
const child = spawn(
  process.execPath,
  [
    "--conditions=react-server",
    "--import",
    "tsx",
    "apps/course-links/src/main.ts",
    ...process.argv.slice(2),
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      SUPABASE_URL: env.API_URL,
      SUPABASE_SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY,
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("close", (code, signal) => {
  process.exitCode = signal ? 1 : code || 0;
});
child.on("error", () => {
  console.error("Local course checker could not start.");
  process.exitCode = 1;
});
