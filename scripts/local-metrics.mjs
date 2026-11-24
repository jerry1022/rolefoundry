import { readFile, mkdir, writeFile, chmod } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

const command = process.argv[2] || "start";
if (!["start", "probe"].includes(command)) throw Error("Use metrics:local or metrics:probe.");
const directory = ".local/observability";
await mkdir(directory, { recursive: true, mode: 0o700 });
await chmod(directory, 0o700);
const tokenFile = `${directory}/metrics-token`;
if (command === "start") {
  try {
    await writeFile(tokenFile, randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
}
await chmod(tokenFile, 0o600);
const token = (await readFile(tokenFile, "utf8")).trim();
if (!/^[0-9a-f]{64}$/.test(token)) throw Error("Invalid local metrics token file.");
const port = Number(process.env.ROLEFOUNDRY_METRICS_PORT || 9464);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error("Invalid metrics port.");
if (command === "probe") {
  const response = await fetch(`http://127.0.0.1:${port}/metrics`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(7000),
  });
  const text = await response.text();
  if (!response.ok || !text.includes("rolefoundry_exporter_up 1\n") || !text.endsWith("# EOF\n"))
    throw Error("Local metrics probe failed; inspect exporter health privately.");
  console.log(JSON.stringify({ event: "metrics.probe", healthy: true, format: "OpenMetrics 1.0" }));
} else {
  const env = JSON.parse(await readFile(".local/identity-env.json", "utf8"));
  if (!["127.0.0.1", "localhost"].includes(new URL(env.API_URL).hostname))
    throw Error("Local metrics refuses a hosted configuration.");
  const child = spawn(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", "apps/observability/src/main.ts"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        SUPABASE_URL: env.API_URL,
        SUPABASE_SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY,
        ROLEFOUNDRY_METRICS_TOKEN: token,
        ROLEFOUNDRY_METRICS_HOST: "127.0.0.1",
        ROLEFOUNDRY_METRICS_PORT: String(port),
      },
    },
  );
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  child.on("error", () => {
    console.error("Local metrics could not start.");
    process.exitCode = 1;
  });
  child.on("close", (code, signal) => {
    process.exitCode = signal ? 1 : code || 0;
  });
}
