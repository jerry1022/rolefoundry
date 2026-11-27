import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { LocalFixtures, type LocalMember } from "../support/local-fixtures";
import { AIGateway } from "../../src/modules/gateway/service";
import { FakeAdapter } from "../../src/modules/gateway/adapters/fake";
import {
  SupabaseGatewayAuthority,
  SupabaseGatewayRecorder,
} from "../../src/modules/gateway/adapters/supabase";
import { parseGatewayPolicy } from "../../src/modules/gateway/policy";
import { gatewayTemplates, rankSpec, wordingSpec } from "../../src/modules/gateway/recipes";
import type { GatewayRequest } from "../../src/modules/gateway/model";
import { telemetrySnapshotSchema } from "../../src/modules/telemetry/model";

vi.mock("server-only", () => ({}));

// Unique recipient IDs keep this test's approvals separate from any other local data.
const suffix = crypto.randomUUID().slice(0, 8);
const primary = `fake-${suffix}`;
const upstream = `fake-up-${suffix}`;
let stack: LocalFixtures, owner: LocalMember, other: LocalMember, admin: LocalMember;
const resource = crypto.randomUUID();

const good = JSON.stringify({
  suggestions: [
    { factRef: "fact-1", text: "Built a retrieval prototype for 3 teams.", rationale: "Clearer." },
  ],
});

function gateway(adapter = new FakeAdapter(primary, [{ text: good }]), recipients = [primary]) {
  const policy = parseGatewayPolicy(
    JSON.stringify({
      routes: {
        "resume.wording": {
          primary: { adapter: primary, model: "fake-model", recipients },
          deadlineMs: 5000,
          primaryAttempts: 1,
          maxInputChars: 4000,
          maxOutputTokens: 200,
          concurrency: 1,
        },
      },
    }),
  );
  return new AIGateway({
    policy,
    adapters: [adapter],
    templates: gatewayTemplates,
    authority: new SupabaseGatewayAuthority(stack.privileged),
  });
}

const request = (
  taskId: string,
  ownerId: string,
  inputVersion = "resume-version:1",
): GatewayRequest => ({
  taskId,
  purpose: "resume.wording",
  ownerId,
  inputVersion,
  templateVersion: "resume-wording-v1",
  locale: "en",
  instructions: "Improve wording.",
  segments: [{ ref: "fact-1", label: "fact", text: "Built a retrieval prototype for 3 teams." }],
  allowedRefs: ["fact-1"],
});

/** Grants owner consent, reserves budget and starts the identity task like a real worker. */
async function startedTask(member: LocalMember, inputVersion = "resume-version:1", start = true) {
  const policies = await member.client.rpc("identity_policies");
  const version = (policies.data as { purpose: string; version: string }[]).find(
    (p) => p.purpose === "resume",
  )!.version;
  expect(
    (
      await member.client.rpc("identity_grant_consent", {
        p_purpose: "resume",
        p_policy_version: version,
      })
    ).error,
  ).toBeNull();
  const reserved = await stack.privileged.rpc("identity_reserve_analysis", {
    p_user: member.id,
    p_feature: "resume",
    p_resource_ref: resource,
    p_input_version: inputVersion,
    p_idempotency_key: `gateway-test-${crypto.randomUUID()}`,
  });
  expect(reserved.error).toBeNull();
  const taskId = (reserved.data as { taskId: string }).taskId;
  if (start)
    expect(
      (await stack.privileged.rpc("identity_start_task", { p_task: taskId })).error,
    ).toBeNull();
  return taskId;
}

beforeAll(async () => {
  stack = await LocalFixtures.open();
  owner = await stack.member();
  other = await stack.member();
  admin = await stack.member(true);
});
afterAll(async () => {
  if (!stack) return;
  await stack.sql.query("delete from public.ai_recipient_approvals where recipient = any($1)", [
    [primary, upstream],
  ]);
  await stack.close();
});

it("keeps recipient approval administrator-only, audited and invisible to raw table reads", async () => {
  const change = { purpose: "resume", recipient: primary, reason: "Reviewed synthetic test route" };
  expect((await stack.request("identity/admin/ai-recipients", owner, "POST", change)).status).toBe(
    403,
  );
  expect((await stack.request("identity/admin/ai-recipients", owner)).status).toBe(403);
  expect((await stack.request("identity/admin/ai-recipients")).status).toBe(401);
  expect(
    (
      await stack.request("identity/admin/ai-recipients", admin, "POST", {
        ...change,
        recipient: "Bad ID",
      })
    ).status,
  ).toBe(400);
  const approved = await stack.request("identity/admin/ai-recipients", admin, "POST", change);
  expect(approved.status).toBe(201);
  expect((await stack.request("identity/admin/ai-recipients", admin, "POST", change)).status).toBe(
    409,
  );
  const listed = await (await stack.request("identity/admin/ai-recipients", admin)).json();
  expect(listed.data.approvals).toEqual(
    expect.arrayContaining([expect.objectContaining({ purpose: "resume", recipient: primary })]),
  );
  const audit = await stack.sql.query(
    "select 1 from public.identity_audit where actor_id=$1 and action='ai.recipient_approved' and reason like $2",
    [admin.id, `resume:${primary}%`],
  );
  expect(audit.rowCount).toBe(1);
  const anonymous = createClient(stack.env.API_URL, stack.env.ANON_KEY, {
    auth: { persistSession: false },
  });
  for (const client of [anonymous, owner.client, admin.client, stack.privileged])
    for (const table of ["ai_recipient_approvals", "gateway_results", "gateway_attempts"])
      expect((await client.from(table).select("*")).error).toBeTruthy();
  for (const client of [owner.client, admin.client])
    expect(
      (
        await client.rpc("gateway_admit", {
          p_task: crypto.randomUUID(),
          p_owner: owner.id,
          p_purpose: "resume.wording",
          p_input_version: "x",
          p_recipients: [primary],
        })
      ).error,
    ).toBeTruthy();
});

it("admits only a started, consented task for its exact owner, input version and approved recipients", async () => {
  const taskId = await startedTask(owner);
  const ok = await gateway().execute(
    request(taskId, owner.id),
    wordingSpec,
    new AbortController().signal,
  );
  expect(ok).toMatchObject({ state: "succeeded", provider: primary });

  const cases: [GatewayRequest, string][] = [
    [request(taskId, other.id), "RF_FORBIDDEN"],
    [request(taskId, owner.id, "resume-version:2"), "RF_FORBIDDEN"],
    [request(crypto.randomUUID(), owner.id), "RF_FORBIDDEN"],
  ];
  for (const [input, code] of cases) {
    const adapter = new FakeAdapter(primary, [{ text: good }]);
    expect(
      await gateway(adapter).execute(input, wordingSpec, new AbortController().signal),
    ).toMatchObject({ state: "rejected", code });
    expect(adapter.calls).toHaveLength(0);
  }

  const unapproved = new FakeAdapter(primary, [{ text: good }]);
  const route = await gateway(unapproved, [primary, upstream]).execute(
    request(taskId, owner.id),
    wordingSpec,
    new AbortController().signal,
  );
  expect(route).toMatchObject({ state: "rejected", code: "RF_RECIPIENT_NOT_APPROVED" });
  expect(unapproved.calls).toHaveLength(0);

  const queued = await startedTask(owner, "resume-version:queued", false);
  expect(
    await gateway().execute(
      request(queued, owner.id, "resume-version:queued"),
      wordingSpec,
      new AbortController().signal,
    ),
  ).toMatchObject({ code: "RF_CONFLICT" });
});

it("stops publication when consent is revoked during the provider call", async () => {
  const taskId = await startedTask(owner, "resume-version:revoke");
  const adapter = new FakeAdapter(primary, () => ({ text: good }));
  const slow = {
    id: primary,
    complete: async (call: Parameters<FakeAdapter["complete"]>[0], signal: AbortSignal) => {
      expect(
        (await owner.client.rpc("identity_revoke_consent", { p_purpose: "resume" })).error,
      ).toBeNull();
      return adapter.complete(call, signal);
    },
  };
  const result = await gateway(slow as unknown as FakeAdapter).execute(
    request(taskId, owner.id, "resume-version:revoke"),
    wordingSpec,
    new AbortController().signal,
  );
  expect(result).toMatchObject({ state: "stale", code: "RF_STALE", output: null });
});

it("records content-free results and attempts once and exports provider usage telemetry", async () => {
  const taskId = await startedTask(other, "resume-version:record");
  const adapter = new FakeAdapter(primary, [
    { text: "not json", usage: { inputTokens: 40, outputTokens: 3 } },
    { text: good, usage: { inputTokens: 55, outputTokens: 12 } },
  ]);
  const result = await gateway(adapter).execute(
    request(taskId, other.id, "resume-version:record"),
    wordingSpec,
    new AbortController().signal,
  );
  expect(result.state).toBe("succeeded");
  const recorder = new SupabaseGatewayRecorder(stack.privileged);
  await recorder.record(result, new AbortController().signal);
  await recorder.record(result, new AbortController().signal);
  await expect(
    recorder.record({ ...result, state: "stale" }, new AbortController().signal),
  ).rejects.toMatchObject({ code: "RF_CONFLICT" });

  const stored = await stack.sql.query("select * from public.gateway_results where task_id=$1", [
    taskId,
  ]);
  expect(stored.rows[0]).toMatchObject({
    state: "succeeded",
    provider: primary,
    input_tokens: "95",
    output_tokens: "15",
  });
  const attempts = await stack.sql.query(
    "select kind,outcome from public.gateway_attempts where task_id=$1 order by sequence",
    [taskId],
  );
  expect(attempts.rows).toEqual([
    { kind: "call", outcome: "invalid-json" },
    { kind: "repair", outcome: "ok" },
  ]);
  const everything = JSON.stringify([stored.rows, attempts.rows]);
  expect(everything).not.toContain("retrieval prototype");

  const snapshot = telemetrySnapshotSchema.parse(
    (await stack.privileged.rpc("telemetry_snapshot")).data,
  );
  expect(snapshot.gateway).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        provider: primary,
        calls: 2,
        failures: 1,
        inputTokens: 95,
        outputTokens: 15,
      }),
    ]),
  );

  // Owner deletion cascades task-bound records.
  await stack.sql.query("delete from public.identity_tasks where id=$1", [taskId]);
  expect(
    (await stack.sql.query("select 1 from public.gateway_attempts where task_id=$1", [taskId]))
      .rowCount,
  ).toBe(0);
});

it("revokes recipients with an audited reason so later requests are no longer admitted", async () => {
  const change = { purpose: "resume", recipient: primary, reason: "Route retired" };
  expect(
    (
      await stack.request("identity/admin/ai-recipients", admin, "DELETE", {
        ...change,
        reason: " ",
      })
    ).status,
  ).toBe(400);
  expect(
    (await stack.request("identity/admin/ai-recipients", admin, "DELETE", change)).status,
  ).toBe(200);
  expect(
    (await stack.request("identity/admin/ai-recipients", admin, "DELETE", change)).status,
  ).toBe(404);
  const taskId = await startedTask(other, "resume-version:after-revoke");
  const adapter = new FakeAdapter(primary, [{ text: good }]);
  expect(
    await gateway(adapter).execute(
      request(taskId, other.id, "resume-version:after-revoke"),
      wordingSpec,
      new AbortController().signal,
    ),
  ).toMatchObject({ code: "RF_RECIPIENT_NOT_APPROVED" });
  expect(adapter.calls).toHaveLength(0);
});

it("admits semantic ranking only under its own registered matching consent", async () => {
  const member = await stack.member();
  const version = (
    (await member.client.rpc("identity_policies")).data as { purpose: string; version: string }[]
  ).find((policy) => policy.purpose === "matching")!.version;
  // Resume consent alone does not authorize a matching reservation.
  await startedTask(member, "resume-version:only");
  const denied = await stack.privileged.rpc("identity_reserve_analysis", {
    p_user: member.id,
    p_feature: "matching",
    p_resource_ref: resource,
    p_input_version: "profile:1",
    p_idempotency_key: `gateway-test-${crypto.randomUUID()}`,
  });
  expect(denied.error?.message).toBe("RF_CONSENT_REQUIRED");
  for (const feature of ["unknown", "Matching", null])
    expect(
      (
        await stack.privileged.rpc("identity_reserve_analysis", {
          p_user: member.id,
          p_feature: feature,
          p_resource_ref: resource,
          p_input_version: "profile:1",
          p_idempotency_key: `gateway-test-${crypto.randomUUID()}`,
        })
      ).error?.message,
    ).toBe("RF_INVALID_INPUT");

  expect(
    (
      await member.client.rpc("identity_grant_consent", {
        p_purpose: "matching",
        p_policy_version: version,
      })
    ).error,
  ).toBeNull();
  const reserved = await stack.privileged.rpc("identity_reserve_analysis", {
    p_user: member.id,
    p_feature: "matching",
    p_resource_ref: resource,
    p_input_version: "profile:1",
    p_idempotency_key: `gateway-test-${crypto.randomUUID()}`,
  });
  const taskId = (reserved.data as { taskId: string }).taskId;
  expect((await stack.privileged.rpc("identity_start_task", { p_task: taskId })).error).toBeNull();
  const recipient = `fake-rank-${suffix}`;
  const change = { purpose: "matching", recipient, reason: "Reviewed synthetic ranking route" };
  expect((await stack.request("identity/admin/ai-recipients", admin, "POST", change)).status).toBe(
    201,
  );
  try {
    const ranking = JSON.stringify({
      ranking: [{ jobRef: "job-1", score: 0.7, evidenceRefs: ["ev-1"] }],
    });
    const policy = parseGatewayPolicy(
      JSON.stringify({
        routes: {
          "matching.semantic-rank": {
            primary: { adapter: recipient, model: "fake-model", recipients: [recipient] },
            deadlineMs: 5000,
            primaryAttempts: 1,
            maxInputChars: 4000,
            maxOutputTokens: 200,
            concurrency: 1,
          },
        },
      }),
    );
    const rank = new AIGateway({
      policy,
      adapters: [new FakeAdapter(recipient, [{ text: ranking }])],
      templates: gatewayTemplates,
      authority: new SupabaseGatewayAuthority(stack.privileged),
    });
    const result = await rank.execute(
      {
        ...request(taskId, member.id, "profile:1"),
        purpose: "matching.semantic-rank",
        templateVersion: "semantic-rank-v1",
        segments: [
          { ref: "job-1", label: "job", text: "Requires retrieval." },
          { ref: "ev-1", label: "evidence", text: "Built a retrieval prototype." },
        ],
        allowedRefs: ["job-1", "ev-1"],
      },
      rankSpec,
      new AbortController().signal,
    );
    expect(result).toMatchObject({ state: "succeeded", provider: recipient });
    await new SupabaseGatewayRecorder(stack.privileged).record(
      result,
      new AbortController().signal,
    );
  } finally {
    await stack.request("identity/admin/ai-recipients", admin, "DELETE", {
      ...change,
      reason: "Test cleanup",
    });
  }
});

it("shows approved recipients for exactly the current consent version", async () => {
  const policies = async () =>
    (await owner.client.rpc("identity_policies")).data as {
      purpose: string;
      version: string;
      description: string;
      recipients: string[];
    }[];
  const before = await policies();
  expect(
    before.every((policy) => policy.description.includes("approved for this policy version")),
  ).toBe(true);
  const recipient = `fake-shown-${suffix}`;
  const change = { purpose: "resume", recipient, reason: "Reviewed synthetic route" };
  expect((await stack.request("identity/admin/ai-recipients", admin, "POST", change)).status).toBe(
    201,
  );
  try {
    expect((await policies()).find((policy) => policy.purpose === "resume")!.recipients).toContain(
      recipient,
    );
    expect(
      (await policies()).find((policy) => policy.purpose === "assessment")!.recipients,
    ).not.toContain(recipient);
    // An approval for another version is not shown or usable for the current one.
    await stack.sql.query(
      "update public.ai_recipient_approvals set policy_version='old-version' where recipient=$1",
      [recipient],
    );
    expect(
      (await policies()).find((policy) => policy.purpose === "resume")!.recipients,
    ).not.toContain(recipient);
  } finally {
    await stack.sql.query("delete from public.ai_recipient_approvals where recipient=$1", [
      recipient,
    ]);
  }
});

it("leases provider-wide slots with token-bound release and expiry reclaim", async () => {
  const provider = `slot-${suffix}`;
  const acquire = (limit = 1) =>
    stack.privileged.rpc("gateway_slot_acquire", {
      p_provider: provider,
      p_limit: limit,
      p_seconds: 30,
    });
  try {
    const first = await acquire();
    expect(first.error).toBeNull();
    expect(typeof first.data).toBe("string");
    expect((await acquire()).data).toBeNull();
    // Concurrent attempts never exceed the limit.
    const burst = await Promise.all(Array.from({ length: 6 }, () => acquire(3)));
    expect(burst.filter((result) => typeof result.data === "string")).toHaveLength(2);
    expect(
      (
        await stack.privileged.rpc("gateway_slot_release", {
          p_provider: provider,
          p_token: crypto.randomUUID(),
        })
      ).data,
    ).toBe(false);
    expect(
      (
        await stack.privileged.rpc("gateway_slot_release", {
          p_provider: provider,
          p_token: first.data,
        })
      ).data,
    ).toBe(true);
    expect(typeof (await acquire()).data).toBe("string");
    // A crashed worker's slot frees itself when its lease expires.
    await stack.sql.query(
      "update public.gateway_provider_slots set expires_at=now()-interval '1 second' where provider=$1",
      [provider],
    );
    expect(typeof (await acquire()).data).toBe("string");
    for (const args of [
      { p_limit: 0 },
      { p_limit: 65 },
      { p_seconds: 1 },
      { p_provider: "Bad Provider" },
    ])
      expect(
        (
          await stack.privileged.rpc("gateway_slot_acquire", {
            p_provider: provider,
            p_limit: 1,
            p_seconds: 30,
            ...args,
          })
        ).error?.message,
      ).toBe("RF_INVALID_INPUT");
    const anonymous = createClient(stack.env.API_URL, stack.env.ANON_KEY, {
      auth: { persistSession: false },
    });
    for (const client of [anonymous, owner.client, admin.client]) {
      expect(
        (
          await client.rpc("gateway_slot_acquire", {
            p_provider: provider,
            p_limit: 1,
            p_seconds: 30,
          })
        ).error,
      ).toBeTruthy();
      expect((await client.from("gateway_provider_slots").select("*")).error).toBeTruthy();
    }
  } finally {
    await stack.sql.query("delete from public.gateway_provider_slots where provider=$1", [
      provider,
    ]);
  }
});

it("reserves rolling provider token budgets and settles once", async () => {
  const provider = `budget-${suffix}`;
  const reserve = (tokens: number, cap = 1000) =>
    stack.privileged.rpc("gateway_budget_reserve", {
      p_provider: provider,
      p_tokens: tokens,
      p_daily_cap: cap,
    });
  try {
    const first = await reserve(600);
    expect(typeof first.data).toBe("string");
    expect((await reserve(500)).data).toBeNull();
    // Settling below the estimate frees budget; a second settle keeps the first value.
    expect(
      (
        await stack.privileged.rpc("gateway_budget_settle", {
          p_provider: provider,
          p_id: first.data,
          p_actual: 200,
        })
      ).data,
    ).toBe(true);
    expect(
      (
        await stack.privileged.rpc("gateway_budget_settle", {
          p_provider: provider,
          p_id: first.data,
          p_actual: 900,
        })
      ).data,
    ).toBe(false);
    expect(typeof (await reserve(700)).data).toBe("string");
    // Concurrent reservations never exceed the cap.
    const burst = await Promise.all(Array.from({ length: 5 }, () => reserve(50)));
    expect(burst.filter((result) => typeof result.data === "string")).toHaveLength(2);
    // Usage older than 24 hours no longer counts.
    await stack.sql.query(
      "update public.gateway_token_reservations set created_at=now()-interval '25 hours' where provider=$1",
      [provider],
    );
    expect(typeof (await reserve(900)).data).toBe("string");
    for (const args of [{ p_tokens: 0 }, { p_daily_cap: 0 }, { p_provider: "Bad" }])
      expect(
        (
          await stack.privileged.rpc("gateway_budget_reserve", {
            p_provider: provider,
            p_tokens: 1,
            p_daily_cap: 10,
            ...args,
          })
        ).error?.message,
      ).toBe("RF_INVALID_INPUT");
    for (const client of [owner.client, admin.client]) {
      expect(
        (
          await client.rpc("gateway_budget_reserve", {
            p_provider: provider,
            p_tokens: 1,
            p_daily_cap: 10,
          })
        ).error,
      ).toBeTruthy();
      expect((await client.from("gateway_token_reservations").select("*")).error).toBeTruthy();
    }
  } finally {
    await stack.sql.query("delete from public.gateway_token_reservations where provider=$1", [
      provider,
    ]);
  }
});

it("records estimated cost from configured pricing and reports provider spend", async () => {
  const recipient = `fake-cost-${suffix}`;
  expect(
    (
      await stack.request("identity/admin/ai-recipients", admin, "POST", {
        purpose: "resume",
        recipient,
        reason: "Reviewed priced route",
      })
    ).status,
  ).toBe(201);
  try {
    const member = await stack.member();
    const taskId = await startedTask(member, "resume-version:cost");
    const priced = new AIGateway({
      policy: parseGatewayPolicy(
        JSON.stringify({
          routes: {
            "resume.wording": {
              primary: {
                adapter: recipient,
                model: "fake-model",
                recipients: [recipient],
                pricing: { inputPerMillionUsd: 3, outputPerMillionUsd: 15 },
              },
              deadlineMs: 5000,
              primaryAttempts: 1,
              maxInputChars: 4000,
              maxOutputTokens: 200,
              concurrency: 1,
            },
          },
        }),
      ),
      adapters: [
        new FakeAdapter(recipient, [
          { text: good, usage: { inputTokens: 1000, outputTokens: 200 } },
        ]),
      ],
      templates: gatewayTemplates,
      authority: new SupabaseGatewayAuthority(stack.privileged),
    });
    const result = await priced.execute(
      request(taskId, member.id, "resume-version:cost"),
      wordingSpec,
      new AbortController().signal,
    );
    expect(result).toMatchObject({ state: "succeeded", costMicros: 6000 });
    await new SupabaseGatewayRecorder(stack.privileged).record(
      result,
      new AbortController().signal,
    );
    const stored = await stack.sql.query(
      "select cost_micros from public.gateway_results where task_id=$1",
      [taskId],
    );
    expect(stored.rows[0].cost_micros).toBe("6000");
    const snapshot = telemetrySnapshotSchema.parse(
      (await stack.privileged.rpc("telemetry_snapshot")).data,
    );
    expect(snapshot.gateway?.find((item) => item.provider === recipient)?.costMicros).toBe(6000);
  } finally {
    await stack.sql.query("delete from public.ai_recipient_approvals where recipient=$1", [
      recipient,
    ]);
  }
});
