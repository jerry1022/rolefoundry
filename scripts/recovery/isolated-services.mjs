import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, rm } from "node:fs/promises";
import path from "node:path";
const execute = promisify(execFile);
const project = "rolefoundry-identity";
const network = `supabase_network_${project}`;
const dbHost = `supabase_db_${project}`;
const label = "com.rolefoundry.recovery-run";
async function docker(args) {
  try {
    return (await execute("docker", args, { timeout: 30000, maxBuffer: 2 * 1024 * 1024 })).stdout;
  } catch {
    throw Error("Isolated recovery service command failed; credentials are not printed.");
  }
}
function environment(container) {
  return Object.fromEntries(
    container.Config.Env.map((value) => {
      const index = value.indexOf("=");
      return [value.slice(0, index), value.slice(index + 1)];
    }),
  );
}
function select(env, names) {
  return Object.fromEntries(
    names.filter((key) => env[key] !== undefined).map((key) => [key, env[key]]),
  );
}
function connection(raw, target) {
  const url = new URL(raw);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.pathname !== "/postgres" ||
    ![dbHost, "127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw Error("Unexpected local service database configuration.");
  url.hostname = dbHost;
  url.port = "5432";
  url.pathname = `/${target}`;
  url.search = "";
  url.hash = "";
  return url.href;
}
/** Runs the already installed images with fresh storage and database-specific connections. */
export async function isolatedServices({ runId, target, runDirectory }) {
  if (!/^[a-f0-9]{32}$/.test(runId) || target !== `rf_restore_${runId}`)
    throw Error("Invalid recovery service ownership.");
  const owned = [],
    files = [],
    ports = {};
  async function inspect(name) {
    return JSON.parse(await docker(["inspect", name]))[0];
  }
  async function stop() {
    let failed = false;
    for (const name of [...owned].reverse()) {
      try {
        const value = await inspect(name);
        if (
          value.Config.Labels?.[label] !== runId ||
          value.Config.Labels?.[`${label}-database`] !== target ||
          !name.startsWith(`rf-restore-${runId}-`)
        )
          throw Error();
        await docker(["rm", "--force", "--volumes", name]);
      } catch {
        failed = true;
      }
    }
    for (const file of files)
      await rm(file, { force: true }).catch(() => {
        failed = true;
      });
    if (failed) {
      const error = Error(
        "Owned recovery service cleanup failed; keep the target disconnected and inspect the exact run resources.",
      );
      error.recoveryServicesCleanupFailed = true;
      throw error;
    }
  }
  async function start(kind, internalPort, env, volume = false) {
    const original = await inspect(`supabase_${kind}_${project}`);
    if (
      !original.State.Running ||
      !original.NetworkSettings.Networks[network] ||
      !/^sha256:[a-f0-9]{64}$/.test(original.Image)
    )
      throw Error("Local recovery image is unavailable.");
    const name = `rf-restore-${runId}-${kind}`,
      file = path.join(runDirectory, `${kind}.env`);
    const variables = env(environment(original));
    if (
      Object.entries(variables).some(
        ([key, value]) => !/^[A-Z][A-Z0-9_]*$/.test(key) || /[\r\n\0]/.test(value),
      )
    )
      throw Error("Unsupported recovery environment value.");
    await writeFile(
      file,
      Object.entries(variables)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n") + "\n",
      { flag: "wx", mode: 0o600 },
    );
    files.push(file);
    // Own the name before launch so a partially successful Docker operation is also cleaned.
    // A pre-existing name is refused; never adopt an unrelated container.
    const inventory = JSON.parse(
      await docker(["ps", "-a", "--format", "json"]).then(
        (raw) => `[${raw.trim().split("\n").filter(Boolean).join(",")}]`,
      ),
    );
    if (inventory.some((value) => value.Names === name))
      throw Error("Recovery container name already exists.");
    owned.push(name);
    await docker([
      "run",
      "--detach",
      "--pull=never",
      "--name",
      name,
      "--label",
      `${label}=${runId}`,
      "--label",
      `${label}-database=${target}`,
      "--network",
      network,
      "--publish",
      `127.0.0.1::${internalPort}`,
      "--env-file",
      file,
      ...(volume ? ["--volume", "/var/lib/storage"] : []),
      original.Image,
    ]);
    const value = await inspect(name),
      binding = value.NetworkSettings.Ports[`${internalPort}/tcp`]?.[0];
    if (binding?.HostIp !== "127.0.0.1" || !/^\d+$/.test(binding.HostPort))
      throw Error("Recovery service must be bound only to loopback.");
    ports[kind] = `http://127.0.0.1:${binding.HostPort}`;
  }
  try {
    await start("rest", 3000, (env) => ({
      ...select(env, [
        "PGRST_DB_EXTRA_SEARCH_PATH",
        "PGRST_DB_MAX_ROWS",
        "PGRST_DB_ANON_ROLE",
        "PGRST_JWT_SECRET",
        "PGRST_DB_SCHEMAS",
      ]),
      PGRST_DB_URI: connection(env.PGRST_DB_URI, target),
      PGRST_SERVER_PORT: "3000",
    }));
    await start("auth", 9999, (env) => ({
      ...select(env, [
        "GOTRUE_JWT_SECRET",
        "GOTRUE_JWT_KEYS",
        "GOTRUE_JWT_VALID_METHODS",
        "GOTRUE_JWT_VALIDMETHODS",
        "GOTRUE_JWT_AUD",
        "GOTRUE_JWT_ADMIN_ROLES",
        "GOTRUE_JWT_DEFAULT_GROUP_NAME",
        "GOTRUE_JWT_EXP",
        "GOTRUE_DB_DRIVER",
      ]),
      GOTRUE_DB_DATABASE_URL: connection(env.GOTRUE_DB_DATABASE_URL, target),
      GOTRUE_API_HOST: "0.0.0.0",
      GOTRUE_API_PORT: "9999",
      API_EXTERNAL_URL: "http://127.0.0.1:9999",
      GOTRUE_SITE_URL: "http://127.0.0.1:9999",
      GOTRUE_DISABLE_SIGNUP: "true",
      GOTRUE_EXTERNAL_EMAIL_ENABLED: "false",
      GOTRUE_EXTERNAL_PHONE_ENABLED: "false",
      GOTRUE_SMTP_HOST: "127.0.0.1",
      GOTRUE_SMTP_PORT: "1",
      GOTRUE_MAILER_AUTOCONFIRM: "true",
    }));
    await start(
      "storage",
      5000,
      (env) => ({
        ...select(env, [
          "DB_MIGRATIONS_FREEZE_AT",
          "ANON_KEY",
          "SERVICE_KEY",
          "AUTH_JWT_SECRET",
          "JWT_JWKS",
          "FILE_SIZE_LIMIT",
          "UPLOAD_FILE_SIZE_LIMIT",
        ]),
        DATABASE_URL: connection(env.DATABASE_URL, target),
        POSTGREST_URL: `http://rf-restore-${runId}-rest:3000`,
        STORAGE_BACKEND: "file",
        FILE_STORAGE_BACKEND_PATH: "/var/lib/storage",
        TENANT_ID: `rf-restore-${runId}`,
        ENABLE_IMAGE_TRANSFORMATION: "false",
        IMAGE_TRANSFORMATION_ENABLED: "false",
        S3_PROTOCOL_ENABLED: "false",
        VECTOR_ENABLED: "false",
        VECTOR_STORE_MIGRATIONS_ENABLED: "false",
      }),
      true,
    );
    for (const [kind, endpoint] of [
      ["rest", "/"],
      ["auth", "/health"],
      ["storage", "/status"],
    ]) {
      const deadline = Date.now() + 20000;
      let ready = false;
      while (Date.now() < deadline) {
        try {
          const response = await fetch(ports[kind] + endpoint, {
            signal: AbortSignal.timeout(1500),
          });
          if (response.ok) {
            ready = true;
            break;
          }
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      if (!ready) throw Error(`Isolated ${kind} service did not become ready.`);
    }
    return {
      stop,
      fetch: async (input, init = {}) => {
        const url = new URL(
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        );
        if (url.origin !== "http://recovery.invalid")
          throw Error("Unexpected recovery API origin.");
        const match = url.pathname.match(/^\/(auth|rest|storage)\/v1(\/.*)?$/);
        if (!match) throw Error("Unexpected recovery API route.");
        return fetch(ports[match[1]] + (match[2] || "/") + url.search, {
          ...init,
          redirect: "error",
          signal: AbortSignal.any([
            AbortSignal.timeout(10000),
            ...(init.signal ? [init.signal] : []),
          ]),
        });
      },
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
