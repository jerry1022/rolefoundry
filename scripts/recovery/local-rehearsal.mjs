import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile, lstat, rm } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { quote, digest, databaseSnapshot, compareSnapshots } from "./postgres-snapshot.mjs";
import { exportQueue, restoreQueue } from "./queue-snapshot.mjs";
import { isolatedServices } from "./isolated-services.mjs";
import { deletionFixture } from "./deletion-fixture.mjs";
import { readDeletionLedger, applyDeletionLedger } from "./deletion-ledger.mjs";

const workspace = fileURLToPath(new URL("../../", import.meta.url));
const local = path.join(workspace, ".local");
const container = "supabase_db_rolefoundry-identity";
const runId = randomUUID().replaceAll("-", "");
const target = `rf_restore_${runId}`;
const marker = `RoleFoundry disposable recovery rehearsal ${runId}`;
const runDirectory = path.join(local, "recovery", runId);
const archive = path.join(runDirectory, "database.dump");
const reportPath = path.join(runDirectory, "report.json");
const started = performance.now();
const arguments_ = process.argv.slice(2);
const modes = [
  "--verify-failure-cleanup",
  "--verify-deletion-replay",
  "--verify-deletion-replay-failure",
];
const ledgerArgument = arguments_.length === 2 && arguments_[0] === "--deletion-ledger";
if (
  !ledgerArgument &&
  (arguments_.length > 1 || arguments_.some((value) => !modes.includes(value)))
)
  throw Error("Use one rehearsal mode, or --deletion-ledger <private-json-path>.");
const verifyFailureCleanup = arguments_.includes("--verify-failure-cleanup");
const verifyServiceFailureCleanup = arguments_.includes("--verify-deletion-replay-failure");
const verifyDeletionReplay =
  arguments_.includes("--verify-deletion-replay") || verifyServiceFailureCleanup;
const externalLedger = ledgerArgument ? await readDeletionLedger(arguments_[1]) : undefined;
const cleanupProbe = Error("Intentional disposable restore failure.");

async function directory(location) {
  try {
    const info = await lstat(location);
    if (!info.isDirectory() || info.isSymbolicLink()) throw Error("Unsafe rehearsal directory.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await mkdir(location, { mode: 0o700 });
  }
}
async function docker(args, output) {
  const child = spawn("docker", ["exec", "--user", "postgres", container, ...args], {
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120000,
    killSignal: "SIGTERM",
  });
  const errors = [];
  let stderrBytes = 0;
  child.stderr.on("data", (chunk) => {
    stderrBytes += chunk.length;
    if (stderrBytes <= 65536) errors.push(chunk);
  });
  const completed = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code));
  });
  if (output)
    await Promise.all([
      pipeline(child.stdout, createWriteStream(output, { flags: "wx", mode: 0o600 })),
      completed.then(async (code) => {
        if (code !== 0) {
          await writeFile(path.join(runDirectory, "backup-error.log"), Buffer.concat(errors), {
            mode: 0o600,
          });
          throw Error(
            "Database backup command failed; inspect only the private rehearsal diagnostics.",
          );
        }
      }),
    ]);
  else {
    child.stdout.resume();
    if ((await completed) !== 0) {
      await writeFile(path.join(runDirectory, "restore-error.log"), Buffer.concat(errors), {
        mode: 0o600,
      });
      throw Error(
        "Database restore command failed; diagnostics remain in the private rehearsal directory.",
      );
    }
  }
}

let source,
  restored,
  fixture,
  services,
  created = false,
  directoryOwned = false,
  inSnapshot = false,
  result,
  failure;
try {
  await directory(local);
  const envPath = path.join(local, "identity-env.json");
  let env, url;
  try {
    const file = await lstat(envPath);
    if (!file.isFile() || file.isSymbolicLink()) throw Error();
    env = JSON.parse(await readFile(envPath, "utf8"));
    url = new URL(env.DB_URL);
  } catch {
    throw Error("Local recovery settings are missing or invalid; credentials are not printed.");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.port !== "54322" ||
    url.pathname !== "/postgres"
  )
    throw Error(
      "Recovery rehearsal accepts only this project's loopback PostgreSQL database on port 54322.",
    );
  const config = await readFile(path.join(workspace, "supabase/config.toml"), "utf8");
  if (!/^project_id\s*=\s*"rolefoundry-identity"/m.test(config))
    throw Error("Project identity does not match the rehearsal target.");
  await directory(path.join(local, "recovery"));
  await mkdir(runDirectory, { mode: 0o700 });
  directoryOwned = true;
  source = new pg.Client({
    connectionString: env.DB_URL,
    application_name: "rolefoundry-recovery-source",
    statement_timeout: 120000,
  });
  await source.connect();
  await source.query("set timezone='UTC'");
  if ((await source.query("select current_database() name")).rows[0].name !== "postgres")
    throw Error("Unexpected source database.");
  if (verifyDeletionReplay) {
    fixture = deletionFixture(env, source, runDirectory);
    await fixture.prepare();
  }
  console.log(
    "Capturing a consistent local database backup; no row contents or credentials are printed.",
  );
  await source.query("begin isolation level repeatable read read only");
  inSnapshot = true;
  const snapshotId = (await source.query("select pg_export_snapshot() id")).rows[0].id;
  if (!/^[0-9a-f-]+$/i.test(snapshotId)) throw Error("Unexpected snapshot identifier.");
  const before = await databaseSnapshot(source);
  const queue = await exportQueue(source, runDirectory);
  await docker(
    [
      "pg_dump",
      "--username",
      "postgres",
      "--dbname",
      "postgres",
      "--format",
      "custom",
      "--no-publications",
      "--no-subscriptions",
      `--snapshot=${snapshotId}`,
    ],
    archive,
  );
  await source.query("rollback");
  inSnapshot = false;
  await fixture?.afterBackup();
  await source.query(`create database ${quote(target)} template template0`);
  created = true;
  await source.query(`comment on database ${quote(target)} is '${marker}'`);
  if (verifyFailureCleanup) throw cleanupProbe;
  // Feed the archive over stdin: no backup file or credential is copied into the container.
  const { createReadStream } = await import("node:fs");
  const restore = spawn(
    "docker",
    [
      "exec",
      "--interactive",
      "--user",
      "postgres",
      container,
      "pg_restore",
      "--username",
      "supabase_admin",
      "--dbname",
      target,
      "--exit-on-error",
      "--no-publications",
      "--no-subscriptions",
    ],
    { stdio: ["pipe", "ignore", "pipe"], timeout: 120000 },
  );
  const errors = [];
  let size = 0;
  restore.stderr.on("data", (chunk) => {
    size += chunk.length;
    if (size <= 65536) errors.push(chunk);
  });
  const completion = new Promise((resolve, reject) => {
    restore.once("error", reject);
    restore.once("close", resolve);
  });
  try {
    const [, code] = await Promise.all([
      pipeline(createReadStream(archive), restore.stdin),
      completion,
    ]);
    if (code !== 0) throw Error("restore-failed");
  } catch {
    await writeFile(path.join(runDirectory, "restore-error.log"), Buffer.concat(errors), {
      mode: 0o600,
    });
    throw Error("Database restore failed; inspect only the private rehearsal diagnostics.");
  }
  const restoredUrl = new URL(env.DB_URL);
  restoredUrl.pathname = `/${target}`;
  restored = new pg.Client({
    connectionString: restoredUrl.href,
    application_name: "rolefoundry-recovery-check",
    statement_timeout: 120000,
  });
  await restored.connect();
  await restored.query("set timezone='UTC'");
  await restoreQueue(restored, runDirectory, queue, before.sequences);
  const after = await databaseSnapshot(restored);
  if (digest(before) !== digest(after)) {
    const comparison = compareSnapshots(before, after);
    await writeFile(path.join(runDirectory, "comparison.json"), JSON.stringify(comparison), {
      mode: 0o600,
    });
    throw Error(
      `Recovery comparison failed for ${comparison.differentSections.join(", ")}; no row contents are printed.`,
    );
  }
  const sequence = before.sequences.find(
    (item) => item.schema === "pgmq" && item.name === "q_rolefoundry_tasks_msg_id_seq",
  );
  if (!sequence) throw Error("Queue identity sequence was not captured.");
  const expected = BigInt(sequence.value) + (sequence.is_called ? 1n : 0n);
  const probeId = (
    await restored.query("select pgmq.send($1,$2::jsonb) id", [
      queue.queueName,
      JSON.stringify({ recoveryProbe: runId }),
    ])
  ).rows[0].id;
  if (BigInt(probeId) !== expected)
    throw Error("Restored queue sequence did not continue correctly.");
  if (
    (
      await restored.query("select pgmq.archive($1,$2::bigint) archived", [
        queue.queueName,
        probeId,
      ])
    ).rows[0].archived !== true
  )
    throw Error("Restored queue failed its isolated archive probe.");
  if (
    (
      await restored.query(
        "select message->>'recoveryProbe' probe from pgmq.a_rolefoundry_tasks where msg_id=$1",
        [probeId],
      )
    ).rows[0]?.probe !== runId
  )
    throw Error("Restored queue probe payload did not round-trip.");

  let deletionReplay;
  if (verifyDeletionReplay) {
    console.log(
      "Verifying newer deletion markers against isolated Auth, Storage and REST services.",
    );
    services = await isolatedServices({ runId, target, runDirectory });
    if (verifyServiceFailureCleanup) throw cleanupProbe;
    deletionReplay = await fixture.verify(restored, services, runId);
  }
  const ledgerOverlay = externalLedger
    ? await applyDeletionLedger(restored, runId, externalLedger.ledger)
    : undefined;
  result = {
    status: "passed",
    ...(ledgerOverlay
      ? {
          ledgerOverlay: {
            entries: ledgerOverlay.entries.length,
            queued: ledgerOverlay.entries.filter((entry) => entry.action === "queued").length,
            ledgerDigest: ledgerOverlay.ledgerDigest,
            fileDigest: externalLedger.fileDigest,
            erasureExecuted: false,
          },
        }
      : {}),
    ...(deletionReplay ? { deletionReplay } : {}),
    createdAt: new Date().toISOString(),
    scope:
      "local project PostgreSQL database restored to an isolated disposable database in the same cluster",
    tables: before.values.length,
    policies: before.policies.length,
    routines: before.routines.length,
    constraints: before.constraints.length,
    triggers: before.triggers.length,
    sequences: before.sequences.length,
    checks: {
      rowCountsAndContent: true,
      tableOwnersAndGrants: true,
      rowLevelSecurityAndPolicies: true,
      publicRoutinesAndGrants: true,
      constraintsAndTriggers: true,
      queueMetadataMessagesAndSequences: true,
      isolatedQueueSendAndArchive: true,
      sequences: true,
      extensionVersions: true,
    },
    excluded: [
      verifyDeletionReplay
        ? "General object backup/recovery; only one controlled PDF tested"
        : "Storage object bytes",
      "cluster roles/global settings",
      "host loss/hosted disaster recovery",
      "external Auth/SMTP/provider configuration",
    ],
    sourceDataModified: verifyDeletionReplay,
    ...(verifyDeletionReplay
      ? { sourceMutationScope: "owned synthetic fixture only; sequence counters advance" }
      : {}),
  };
} catch (error) {
  failure = error;
} finally {
  try {
    await services?.stop();
    if (services && result) result.isolatedServicesRemoved = true;
  } catch (error) {
    failure = error;
  }
  await restored?.end().catch(() => {});
  if (inSnapshot) await source?.query("rollback").catch(() => {});
  if (created && !failure?.recoveryServicesCleanupFailed) {
    try {
      const ownership = (
        await source.query(
          "select shobj_description(oid,'pg_database') marker from pg_database where datname=$1",
          [target],
        )
      ).rows[0];
      if (ownership?.marker !== marker || !/^rf_restore_[a-f0-9]{32}$/.test(target))
        throw Error("Disposable database ownership check failed.");
      await source.query(`drop database ${quote(target)} with (force)`);
      if (result) result.disposableDatabaseRemoved = true;
    } catch {
      failure = Error(
        "Disposable database cleanup failed. Preserve the private report and inspect the owned rehearsal database.",
      );
    }
  }
  try {
    await fixture?.cleanup();
    if (fixture && result) result.sourceFixtureRemoved = true;
  } catch {
    failure = Error("Owned recovery fixture cleanup failed; inspect this run before retrying.");
  }
  await source?.end().catch(() => {});
  for (const name of directoryOwned
    ? [
        "database.dump",
        "pgmq-meta.ndjson",
        "pgmq-q_rolefoundry_tasks.ndjson",
        "pgmq-a_rolefoundry_tasks.ndjson",
      ]
    : [])
    await rm(path.join(runDirectory, name), { force: true }).catch(() => {
      failure = Error("Private archive cleanup failed; inspect the owned rehearsal directory.");
    });
}
if (failure === cleanupProbe) {
  failure = null;
  result = {
    status: "cleanup-verified",
    createdAt: new Date().toISOString(),
    scope: verifyServiceFailureCleanup
      ? "intentional failure after starting owned isolated Auth/Storage/REST services"
      : "intentional failure after creating the owned disposable database",
    ...(verifyServiceFailureCleanup
      ? { isolatedServicesRemoved: true, sourceFixtureRemoved: true }
      : {}),
    disposableDatabaseRemoved: true,
    sourceDataModified: verifyDeletionReplay,
  };
}
if (failure) {
  console.error(failure.message);
  process.exitCode = 1;
} else {
  result.backupArchiveRemoved = true;
  result.elapsedMs = Math.round(performance.now() - started);
  await writeFile(reportPath, JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
  if (verifyFailureCleanup || verifyServiceFailureCleanup)
    console.log(
      "Intentional failure cleanup passed: owned disposable database and all private archives removed.",
    );
  else
    console.log(
      `${verifyDeletionReplay ? "Deletion replay and " : ""}Recovery rehearsal passed: ${result.tables} tables, ${result.policies} policies, ${result.routines} routines. Disposable database and archive removed.`,
    );
  console.log(`Private metadata-only report: ${path.relative(workspace, reportPath)}`);
}
