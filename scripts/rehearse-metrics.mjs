import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

// Every resource belongs to one unique run. Never stop or remove existing project services.
const run = `rf-metrics-${randomUUID()}`,
  directory = resolve(`.local/${run}`);
const containers = [],
  network = run,
  image = `${run}:local`;
let networkCreated = false,
  imageCreated = false;
let interrupted = false,
  cleaning = false,
  activeChild;
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    interrupted = true;
    if (!cleaning) activeChild?.kill("SIGTERM");
  });
await mkdir(directory, { recursive: true, mode: 0o700 });
const log = resolve(".local/metrics-rehearsal.log");
await writeFile(log, "", { mode: 0o600 });
async function docker(args, timeout = 45000) {
  if (interrupted && !cleaning) throw Error("Monitoring rehearsal interrupted.");
  const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
  activeChild = child;
  let output = "";
  const timer = setTimeout(() => child.kill("SIGKILL"), timeout);
  const { appendFile } = await import("node:fs/promises");
  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });
  try {
    await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(Error("Owned monitoring operation failed; inspect the private rehearsal log.")),
      );
    });
    return output.trim();
  } finally {
    if (activeChild === child) activeChild = undefined;
    clearTimeout(timer);
    await appendFile(log, output);
  }
}
async function waitFor(label, predicate, seconds = 45) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    if (interrupted) throw Error("Monitoring rehearsal interrupted.");
    try {
      if (await predicate()) return;
    } catch {
      /* bounded owned service startup */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw Error(`Monitoring rehearsal timed out: ${label}.`);
}
async function runContainer(name, args) {
  // Track before creating so cleanup also covers a failed start after creation.
  containers.push(name);
  await docker([
    "run",
    "--detach",
    "--name",
    name,
    "--label",
    `com.rolefoundry.metrics-run=${run}`,
    ...args,
  ]);
}
try {
  const env = JSON.parse(await readFile(".local/identity-env.json", "utf8"));
  if (!["127.0.0.1", "localhost"].includes(new URL(env.API_URL).hostname))
    throw Error("Rehearsal only accepts the local identity stack.");
  const images = JSON.parse(await readFile("ops/observability/images.json", "utf8"));
  const token = randomBytes(32).toString("hex"),
    exporter = `${run}-exporter`,
    prometheus = `${run}-prometheus`,
    alertmanager = `${run}-alertmanager`,
    receiver = `${run}-receiver`;
  const supabaseNetwork = "supabase_network_rolefoundry-identity";
  await docker(["network", "inspect", supabaseNetwork]);
  console.log("Building the owned metrics image; output stays in the private rehearsal log.");
  await docker(
    [
      "build",
      "--label",
      `com.rolefoundry.metrics-run=${run}`,
      "-f",
      "Dockerfile.metrics",
      "-t",
      image,
      ".",
    ],
    300000,
  );
  imageCreated = true;
  for (const entry of Object.values(images)) await docker(["pull", entry.image], 180000);
  await mkdir(`${directory}/prometheus`, { mode: 0o700 });
  await mkdir(`${directory}/alertmanager`, { mode: 0o700 });
  await writeFile(`${directory}/prometheus/token`, token, { mode: 0o600 });
  if (/[\r\n]/.test(env.SERVICE_ROLE_KEY)) throw Error("Invalid local service credential.");
  await writeFile(
    `${directory}/exporter.env`,
    `SUPABASE_URL=http://supabase_kong_rolefoundry-identity:8000\nSUPABASE_SERVICE_ROLE_KEY=${env.SERVICE_ROLE_KEY}\nROLEFOUNDRY_METRICS_TOKEN=${token}\nROLEFOUNDRY_METRICS_HOST=0.0.0.0\nROLEFOUNDRY_METRICS_PRIVATE_NETWORK=true\n`,
    { mode: 0o600 },
  );
  await writeFile(
    `${directory}/prometheus/prometheus.yml`,
    `global:\n  scrape_interval: 1s\n  scrape_timeout: 900ms\n  evaluation_interval: 1s\nrule_files:\n  - /config/alerts.yml\n  - /config/rehearsal.yml\nalerting:\n  alertmanagers:\n    - static_configs:\n        - targets: ['${alertmanager}:9093']\nscrape_configs:\n  - job_name: rolefoundry\n    authorization:\n      credentials_file: /config/token\n    static_configs:\n      - targets: ['${exporter}:9464']\n`,
    { mode: 0o600 },
  );
  await writeFile(
    `${directory}/prometheus/alerts.yml`,
    await readFile("ops/observability/alerts.yml"),
    {
      mode: 0o600,
    },
  );
  await writeFile(
    `${directory}/prometheus/rehearsal.yml`,
    `groups:\n  - name: rehearsal\n    rules:\n      - alert: RoleFoundryRehearsalExporterDown\n        expr: up{job="rolefoundry"} == 0\n        for: 3s\n`,
    { mode: 0o600 },
  );
  await writeFile(
    `${directory}/prometheus/alerts.test.yml`,
    await readFile("ops/observability/alerts.test.yml"),
    { mode: 0o600 },
  );
  // Only the rehearsal alert reaches the owned receiver; production rules have a sink.
  await writeFile(
    `${directory}/alertmanager/alertmanager.yml`,
    `route:\n  receiver: sink\n  group_by: ['alertname']\n  group_wait: 1s\n  group_interval: 1s\n  repeat_interval: 1m\n  routes:\n    - receiver: owned-rehearsal\n      matchers: ['alertname="RoleFoundryRehearsalExporterDown"']\nreceivers:\n  - name: sink\n  - name: owned-rehearsal\n    webhook_configs:\n      - url: http://${receiver}:9099/alerts\n        send_resolved: true\n`,
    { mode: 0o600 },
  );
  const user = `${process.getuid()}:${process.getgid()}`,
    config = [
      "--user",
      user,
      "--mount",
      `type=bind,src=${directory}/prometheus,dst=/config,readonly`,
    ];
  await docker([
    "run",
    "--rm",
    ...config,
    "--entrypoint",
    "/bin/promtool",
    images.prometheus.image,
    "check",
    "config",
    "/config/prometheus.yml",
  ]);
  await docker([
    "run",
    "--rm",
    ...config,
    "--workdir",
    "/config",
    "--entrypoint",
    "/bin/promtool",
    images.prometheus.image,
    "test",
    "rules",
    "alerts.test.yml",
  ]);
  await docker([
    "run",
    "--rm",
    "--user",
    user,
    "--mount",
    `type=bind,src=${directory}/alertmanager,dst=/config,readonly`,
    "--entrypoint",
    "/bin/amtool",
    images.alertmanager.image,
    "check-config",
    "/config/alertmanager.yml",
  ]);
  await docker([
    "network",
    "create",
    "--internal",
    "--label",
    `com.rolefoundry.metrics-run=${run}`,
    network,
  ]);
  networkCreated = true;
  await runContainer(exporter, [
    "--network",
    supabaseNetwork,
    "--env-file",
    `${directory}/exporter.env`,
    "--read-only",
    "--tmpfs",
    "/tmp",
    image,
  ]);
  await docker(["network", "connect", network, exporter]);
  await runContainer(receiver, [
    "--network",
    network,
    "--read-only",
    "--mount",
    `type=bind,src=${resolve("ops/observability/receiver.mjs")},dst=/receiver.mjs,readonly`,
    "--entrypoint",
    "node",
    image,
    "/receiver.mjs",
  ]);
  await runContainer(alertmanager, [
    "--network",
    network,
    "--user",
    user,
    "--mount",
    `type=bind,src=${directory}/alertmanager,dst=/config,readonly`,
    "--read-only",
    "--tmpfs",
    "/alertmanager:mode=1777",
    images.alertmanager.image,
    "--config.file=/config/alertmanager.yml",
    "--storage.path=/alertmanager",
    "--cluster.listen-address=",
  ]);
  await runContainer(prometheus, [
    "--network",
    network,
    ...config,
    "--read-only",
    "--tmpfs",
    "/prometheus:mode=1777",
    images.prometheus.image,
    "--config.file=/config/prometheus.yml",
    "--storage.tsdb.path=/prometheus",
    "--storage.tsdb.retention.time=1h",
  ]);
  // Probe from the owned receiver: internal networks intentionally publish no host ports.
  const promOrigin = `http://${prometheus}:9090`,
    receiverOrigin = "http://127.0.0.1:9099";
  const getJson = async (url) =>
    JSON.parse(
      await docker(
        [
          "exec",
          receiver,
          "node",
          "--input-type=module",
          "-e",
          "const r=await fetch(process.argv[1],{signal:AbortSignal.timeout(3000)});if(!r.ok)process.exit(1);console.log(JSON.stringify(await r.json()));",
          url,
        ],
        7000,
      ),
    );
  const query = async (expression) => {
    const body = await getJson(
      `${promOrigin}/api/v1/query?query=${encodeURIComponent(expression)}`,
    );
    if (body.status !== "success") throw Error("Owned monitoring query failed.");
    return body.data.result;
  };
  await waitFor(
    "successful authenticated scrape",
    async () => (await query('up{job="rolefoundry"}'))[0]?.value[1] === "1",
  );
  await waitFor(
    "validated database snapshot",
    async () => (await query("rolefoundry_exporter_up"))[0]?.value[1] === "1",
  );
  console.log("Authenticated Prometheus scrape and production rule/config validation passed.");
  if (process.argv.includes("--fail-after-start"))
    throw Error("Intentional owned monitoring cleanup rehearsal.");
  await docker(["stop", "--time", "5", exporter]);
  const received = async () => getJson(`${receiverOrigin}/received`);
  await waitFor("Alertmanager firing webhook", async () => (await received()).firing > 0);
  console.log("Exporter outage reached the owned Alertmanager receiver.");
  await docker(["start", exporter]);
  await waitFor(
    "recovered authenticated scrape",
    async () => (await query('up{job="rolefoundry"}'))[0]?.value[1] === "1",
  );
  await waitFor("Alertmanager resolved webhook", async () => (await received()).resolved > 0);
  console.log(
    "Exporter recovery delivered a resolved notification; no external messages were sent.",
  );
} finally {
  cleaning = true;
  let cleanupFailed = false;
  for (const name of containers.reverse()) {
    try {
      await docker(["logs", "--tail", "30", name]);
    } catch {
      /* diagnostic only */
    }
    try {
      await docker(["rm", "--force", name]);
    } catch {
      cleanupFailed = true;
    }
  }
  if (networkCreated)
    try {
      await docker(["network", "rm", network]);
    } catch {
      cleanupFailed = true;
    }
  if (imageCreated)
    try {
      await docker(["image", "rm", image]);
    } catch {
      cleanupFailed = true;
    }
  // Remove credential-bearing files even when cleanup of a container fails.
  await rm(directory, { recursive: true, force: true });
  if (cleanupFailed)
    throw Error("Owned monitoring cleanup needs inspection; see the private rehearsal log.");
  console.log(
    "Removed this run's monitoring containers, network, image tag and temporary credentials.",
  );
}
