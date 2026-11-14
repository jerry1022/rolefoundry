import { readFile } from "node:fs/promises";
import pg from "pg";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
export type LocalMember = { id: string; email: string; client: SupabaseClient; cookie: string };
/** Owns only explicitly created fixture users; never resets a developer's database. */
export class LocalFixtures {
  readonly users: LocalMember[] = [];
  constructor(
    readonly env: Record<string, string>,
    readonly origin: string,
    readonly sql: pg.Pool,
    readonly privileged: SupabaseClient,
  ) {}
  static async open() {
    const env = JSON.parse(await readFile(".local/identity-env.json", "utf8"));
    const origin = process.env.ROLEFOUNDRY_TEST_ORIGIN!;
    for (const value of [origin, env.API_URL, env.DB_URL])
      if (!["127.0.0.1", "localhost"].includes(new URL(value).hostname))
        throw Error("Only the local test stack is supported.");
    return new LocalFixtures(
      env,
      origin,
      new pg.Pool({ connectionString: env.DB_URL, max: 16 }),
      createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    );
  }
  async request(
    path: string,
    user?: LocalMember,
    method = "GET",
    body?: unknown,
    extra: Record<string, string> = {},
  ) {
    return fetch(`${this.origin}/api/v1/${path}`, {
      method,
      headers: {
        ...(user ? { Cookie: user.cookie } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json", Origin: this.origin }),
        ...extra,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  async member(admin = false) {
    const email = `rf-${crypto.randomUUID()}@identity.test.invalid`;
    await this.sql.query(
      "insert into public.invitations(email_hash,expires_at) values(public.identity_email_hash($1),now()+interval '1 day')",
      [email],
    );
    const created = await this.privileged.auth.admin.createUser({ email, email_confirm: true });
    if (created.error) throw Error("Unable to create a local fixture.");
    const link = await this.privileged.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error) throw Error("Unable to prepare a local sign-in.");
    const response = await this.request("identity/verify", undefined, "POST", {
      email,
      code: link.data.properties!.email_otp,
    });
    if (response.status !== 200) throw Error("Local fixture sign-in failed.");
    const client = createClient(this.env.API_URL, this.env.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const second = await this.privileged.auth.admin.generateLink({ type: "magiclink", email });
    if (second.error) throw Error("Unable to prepare a fixture client.");
    const verified = await client.auth.verifyOtp({
      email,
      token: second.data.properties!.email_otp,
      type: "email",
    });
    if (verified.error) throw Error("Unable to verify a fixture client.");
    const user = {
      id: created.data.user!.id,
      email,
      client,
      cookie: response.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; "),
    };
    this.users.push(user);
    if (admin)
      await this.sql.query("update public.profiles set role='admin' where user_id=$1", [user.id]);
    return user;
  }
  async close() {
    const ids = this.users.map((user) => user.id);
    const emails = this.users.map((user) => user.email);
    await this.sql.query(
      "delete from public.identity_audit where actor_id=any($1::uuid[]) or subject_id=any($1::uuid[])",
      [ids],
    );
    for (const user of this.users) {
      const deleted = await this.privileged.auth.admin.deleteUser(user.id);
      if (deleted.error) throw Error("Unable to remove a local fixture.");
    }
    await this.sql.query(
      "delete from public.invitations where email_hash=any(select public.identity_email_hash(x) from unnest($1::text[]) x)",
      [emails],
    );
    await this.sql.query(
      "delete from public.identity_otp_requests where email_hash=any(select public.identity_email_hash(x) from unnest($1::text[]) x)",
      [emails],
    );
    await this.sql.end();
  }
}
