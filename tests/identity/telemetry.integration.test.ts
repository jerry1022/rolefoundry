import { afterAll, beforeAll, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { LocalFixtures, type LocalMember } from "../support/local-fixtures";
import { telemetrySnapshotSchema } from "../../src/modules/telemetry/model";
let stack: LocalFixtures, member: LocalMember, admin: LocalMember;
const recorded: number[] = [];
beforeAll(async () => {
  stack = await LocalFixtures.open();
  member = await stack.member();
  admin = await stack.member(true);
});
afterAll(async () => {
  if (!stack) return;
  // Remove only this test's successful aggregate contributions; preserve previous observations.
  if (recorded.length) {
    await stack.sql.query(
      "update public.telemetry_http set samples=samples-$1,sum_ms=sum_ms-$2 where family='skills' and method='OPTIONS' and status_class=2 and upper_ms=25",
      [recorded.length, recorded.reduce((a, b) => a + b, 0)],
    );
    await stack.sql.query(
      "delete from public.telemetry_http where family='skills' and method='OPTIONS' and status_class=2 and upper_ms=25 and samples=0 and sum_ms=0",
    );
  }
  await stack.close();
});
it("restricts metrics RPCs to service authority without exposing raw aggregates or the private summary helper", async () => {
  const anonymous = createClient(stack.env.API_URL, stack.env.ANON_KEY, {
    auth: { persistSession: false },
  });
  for (const client of [anonymous, member.client, admin.client]) {
    expect((await client.rpc("telemetry_snapshot")).error).toBeTruthy();
    expect(
      (
        await client.rpc("telemetry_record_http", {
          p_family: "profile",
          p_method: "GET",
          p_status: 200,
          p_duration_ms: 1,
        })
      ).error,
    ).toBeTruthy();
    expect((await client.from("telemetry_http").select("*")).error).toBeTruthy();
  }
  expect((await stack.privileged.from("telemetry_http").select("*")).error).toBeTruthy();
  expect((await stack.privileged.rpc("operations_snapshot_data")).error).toBeTruthy();
  const snapshot = await stack.privileged.rpc("telemetry_snapshot");
  expect(snapshot.error).toBeNull();
  expect(telemetrySnapshotSchema.parse(snapshot.data).operations.kinds).toHaveLength(10);
  for (const privateValue of [member.id, member.email, admin.id, admin.email])
    expect(JSON.stringify(snapshot.data)).not.toContain(privateValue);
});
it("validates inputs and atomically retains every concurrent histogram observation", async () => {
  const args = { p_family: "skills", p_method: "OPTIONS", p_status: 299, p_duration_ms: 22 };
  for (const change of [
    { p_family: member.email },
    { p_method: "private" },
    { p_status: 600 },
    { p_duration_ms: -1 },
    { p_duration_ms: 300001 },
    { p_family: null },
  ])
    expect(
      (await stack.privileged.rpc("telemetry_record_http", { ...args, ...change })).error,
    ).toBeTruthy();
  const before = await stack.sql.query(
    "select samples,sum_ms from public.telemetry_http where family='skills' and method='OPTIONS' and status_class=2 and upper_ms=25",
  );
  const attempts = await Promise.all(
    Array.from({ length: 20 }, async () => {
      const result = await stack.privileged.rpc("telemetry_record_http", args);
      if (!result.error) recorded.push(22);
      return result.error;
    }),
  );
  expect(attempts.every((error) => error === null)).toBe(true);
  const after = await stack.sql.query(
    "select samples,sum_ms from public.telemetry_http where family='skills' and method='OPTIONS' and status_class=2 and upper_ms=25",
  );
  expect(BigInt(after.rows[0].samples) - BigInt(before.rows[0]?.samples || 0)).toBe(20n);
  expect(BigInt(after.rows[0].sum_ms) - BigInt(before.rows[0]?.sum_ms || 0)).toBe(440n);
});
it("records the real production route after its response while excluding query strings and identities", async () => {
  const count = async () =>
    BigInt(
      (
        await stack.sql.query(
          "select coalesce(sum(samples),0)::text n from public.telemetry_http where family='profile' and method='GET' and status_class=4",
        )
      ).rows[0].n,
    );
  const before = await count();
  const response = await stack.request(`profile?private=${encodeURIComponent(member.email)}`);
  expect(response.status).toBe(401);
  await response.text();
  await expect.poll(count, { timeout: 10000 }).toBeGreaterThan(before);
  const columns = await stack.sql.query(
    "select column_name from information_schema.columns where table_schema='public' and table_name='telemetry_http' order by ordinal_position",
  );
  expect(columns.rows.map((row) => row.column_name)).toEqual([
    "family",
    "method",
    "status_class",
    "upper_ms",
    "samples",
    "sum_ms",
  ]);
});
it("runs the independent exporter against real storage with private bearer access and no credential logging", async () => {
  const token = randomBytes(32).toString("hex");
  const child = spawn(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", "apps/observability/src/main.ts"],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        SUPABASE_URL: stack.env.API_URL,
        SUPABASE_SERVICE_ROLE_KEY: stack.env.SERVICE_ROLE_KEY,
        ROLEFOUNDRY_METRICS_TOKEN: token,
        ROLEFOUNDRY_METRICS_HOST: "127.0.0.1",
        ROLEFOUNDRY_METRICS_PORT: "0",
      },
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  try {
    let port = 0;
    await expect
      .poll(
        () => {
          for (const line of output.split("\n")) {
            try {
              const event = JSON.parse(line);
              if (event.event === "metrics.listening") port = event.port;
            } catch {
              /* partial line */
            }
          }
          return port;
        },
        { timeout: 10000 },
      )
      .toBeGreaterThan(0);
    const url = `http://127.0.0.1:${port}/metrics`;
    expect((await fetch(url)).status).toBe(401);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("rolefoundry_exporter_up 1\n");
    expect(text).toContain("rolefoundry_http_request_duration_seconds_bucket{");
    for (const privateValue of [token, stack.env.SERVICE_ROLE_KEY, member.id, member.email]) {
      expect(text).not.toContain(privateValue);
      expect(output).not.toContain(privateValue);
    }
  } finally {
    if (child.exitCode === null) {
      const stopped = new Promise<void>((resolve) => child.once("close", () => resolve()));
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
      try {
        await stopped;
      } finally {
        clearTimeout(timer);
      }
    }
  }
});
