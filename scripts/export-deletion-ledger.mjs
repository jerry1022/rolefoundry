import { readFile, mkdir, open, realpath, stat } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--output")
  throw Error("Usage: npm run account:ledger -- --output <new-private-json-path>");
let env, target;
try {
  env = JSON.parse(await readFile(".local/identity-env.json", "utf8"));
  target = new URL(env.DB_URL);
} catch {
  throw Error("Local ledger settings are missing or invalid; credentials are not printed.");
}
if (
  !["postgres:", "postgresql:"].includes(target.protocol) ||
  !["localhost", "127.0.0.1"].includes(target.hostname) ||
  target.port !== "54322" ||
  target.pathname !== "/postgres"
)
  throw Error("Ledger export only supports the owned local database.");
const filename = path.resolve(args[1]),
  directory = path.dirname(filename);
await mkdir(directory, { recursive: true, mode: 0o700 });
if ((await realpath(directory)) !== directory || (await stat(directory)).mode & 0o077)
  throw Error("Use a private directory without symlink components.");
const sql = new pg.Client({ connectionString: env.DB_URL });
await sql.connect();
try {
  const { rows } = await sql.query(
    `select id as "requestId",subject_id as "subjectId",to_char(requested_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "requestedAt",to_char(completed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "completedAt" from public.account_deletions order by requested_at,id`,
  );
  const handle = await open(filename, "wx", 0o600);
  try {
    await handle.writeFile(
      JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), entries: rows }, null, 2) +
        "\n",
    );
    await handle.sync();
  } finally {
    await handle.close();
  }
  console.log(`Exported ${rows.length} minimized deletion markers. Private ledger: ${filename}`);
} finally {
  await sql.end();
}
