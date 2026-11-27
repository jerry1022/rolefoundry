import { readFile } from "node:fs/promises";
import pg from "pg";
const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  throw new Error("Usage: npm run identity:invite -- user@example.test [--admin]");
const env = JSON.parse(await readFile(".local/identity-env.json", "utf8"));
if (!["127.0.0.1", "localhost"].includes(new URL(env.DB_URL).hostname))
  throw new Error("This bootstrap helper refuses hosted databases.");
const db = new pg.Client({ connectionString: env.DB_URL });
await db.connect();
try {
  const profile = await db.query(
    "select p.user_id from public.profiles p join auth.users u on u.id=p.user_id where lower(u.email)=$1 and u.email_confirmed_at is not null and p.status='active'",
    [email],
  );
  if (profile.rowCount) {
    if (process.argv.includes("--admin")) {
      await db.query("update public.profiles set role='admin' where user_id=$1", [
        profile.rows[0].user_id,
      ]);
      console.log("Promoted the confirmed local development account to administrator.");
    } else console.log("The local account is already active.");
  } else {
    await db.query(
      "insert into public.invitations(email_hash,expires_at) values(public.identity_email_hash($1),now()+interval '7 days') on conflict(email_hash) do update set expires_at=excluded.expires_at where public.invitations.used_at is null",
      [email],
    );
    console.log(
      "Local invitation prepared. Sign in once; rerun with --admin afterward if you need a development administrator.",
    );
  }
} finally {
  await db.end();
}
