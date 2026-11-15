import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
const env = JSON.parse(await readFile(".local/identity-env.json", "utf8"));
if (!["127.0.0.1", "localhost"].includes(new URL(env.API_URL).hostname))
  throw Error("Local worker refuses a hosted configuration.");
const child = spawn(
  process.execPath,
  [
    "--conditions=react-server",
    "--import",
    "tsx",
    "apps/worker/src/main.ts",
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
child.on("close", (code) => {
  process.exitCode = code || 0;
});
