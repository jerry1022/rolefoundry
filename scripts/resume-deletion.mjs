import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
const args = process.argv.slice(2),
  reasons = [
    "storage-restored",
    "directory-restored",
    "configuration-restored",
    "operator-reviewed",
  ];
if (
  args.length !== 4 ||
  args[0] !== "--request" ||
  args[2] !== "--reason" ||
  !reasons.includes(args[3]) ||
  !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(args[1])
)
  throw Error("Usage: npm run account:resume -- --request <request-uuid> --reason <recovery-code>");
let env, target;
try {
  env = JSON.parse(await readFile(".local/identity-env.json", "utf8"));
  target = new URL(env.API_URL);
} catch {
  throw Error("Local recovery settings are missing or invalid; credentials are not printed.");
}
if (
  target.protocol !== "http:" ||
  target.username ||
  target.password ||
  !["localhost", "127.0.0.1"].includes(target.hostname) ||
  target.port !== "54321" ||
  typeof env.SERVICE_ROLE_KEY !== "string" ||
  !env.SERVICE_ROLE_KEY
)
  throw Error("Recovery only supports the owned local identity stack.");
const client = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await client
  .rpc("account_deletion_resume", { p_id: args[1], p_reason: args[3] })
  .abortSignal(AbortSignal.timeout(10000));
if (error)
  throw Error(
    "The accepted request could not be resumed. Review its current state and recovery authorization.",
  );
console.log(
  `Resumed accepted deletion ${data.id}; status ${data.status}. No subject or receipt secret is printed.`,
);
