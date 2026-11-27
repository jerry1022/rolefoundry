import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { LocalFixtures, type LocalMember } from "../support/local-fixtures";
import { MatchingFixtures } from "../support/matching-fixtures";
import { MatchingHandler } from "../../src/modules/matching/handler";
import { SupabaseMatchingExecutionStore } from "../../src/modules/matching/adapters/supabase";
import {
  GatewaySemanticRanking,
  IdentityAnalysisLifecycle,
} from "../../src/modules/matching/adapters/semantic";
import { SemanticRanker } from "../../src/modules/matching/semantic";
import { matchRunSchema, type MatchTask } from "../../src/modules/matching/model";
import { AIGateway } from "../../src/modules/gateway/service";
import { FakeAdapter, type FakeStep } from "../../src/modules/gateway/adapters/fake";
import { parseGatewayPolicy } from "../../src/modules/gateway/policy";
import { gatewayTemplates } from "../../src/modules/gateway/recipes";
import {
  SupabaseGatewayAuthority,
  SupabaseGatewayRecorder,
} from "../../src/modules/gateway/adapters/supabase";
import type { AdapterCall } from "../../src/modules/gateway/ports";

vi.mock("server-only", () => ({}));

let stack: LocalFixtures, admin: LocalMember, fixtures: MatchingFixtures;
const recipient = `fake-rank-${crypto.randomUUID().slice(0, 8)}`;
const tiedJobs: string[] = [];
const signal = () => new AbortController().signal;

/** Scores every job in the request by reverse ID, citing the first evidence segment. */
function reverseScores(call: AdapterCall): FakeStep {
  const payload = JSON.parse(call.messages[1].content) as {
    data: { ref: string; label: string }[];
  };
  const jobs = payload.data
    .filter((item) => item.label === "job")
    .map((item) => item.ref)
    .sort()
    .reverse();
  const evidence = payload.data.find((item) => item.label === "evidence")!.ref;
  return {
    text: JSON.stringify({
      ranking: jobs.map((ref, index) => ({
        jobRef: ref,
        score: 1 - index / 100,
        evidenceRefs: [evidence],
      })),
    }),
  };
}

function handler(step: FakeStep[] | ((call: AdapterCall) => FakeStep) | null) {
  const store = new SupabaseMatchingExecutionStore(stack.privileged);
  const gateway =
    step === null
      ? null
      : new GatewaySemanticRanking(
          new AIGateway(
            parseGatewayPolicy(
              JSON.stringify({
                routes: {
                  "matching.semantic-rank": {
                    primary: { adapter: recipient, model: "fake-model", recipients: [recipient] },
                    deadlineMs: 5000,
                    primaryAttempts: 1,
                    maxInputChars: 60000,
                    maxOutputTokens: 2000,
                    concurrency: 1,
                  },
                },
              }),
            ),
            [new FakeAdapter(recipient, step)],
            gatewayTemplates,
            new SupabaseGatewayAuthority(stack.privileged),
          ),
          new SupabaseGatewayRecorder(stack.privileged),
        );
  return new MatchingHandler(store, {
    store,
    ranker: new SemanticRanker(new IdentityAnalysisLifecycle(stack.privileged), gateway),
  });
}

async function consent(owner: LocalMember) {
  const policies = (await owner.client.rpc("identity_policies")).data as {
    purpose: string;
    version: string;
  }[];
  const version = policies.find((policy) => policy.purpose === "matching")!.version;
  expect(
    (
      await owner.client.rpc("identity_grant_consent", {
        p_purpose: "matching",
        p_policy_version: version,
      })
    ).error,
  ).toBeNull();
}

async function request(
  owner: LocalMember,
  semantic: boolean,
): Promise<MatchTask & { semantic: { state: string; code: string | null } }> {
  const response = await stack.request(
    "matches",
    owner,
    "POST",
    { jobId: null, constraints: { experienceYears: null, confirmations: [] }, semantic },
    { "Idempotency-Key": crypto.randomUUID() },
  );
  expect(response.status).toBe(202);
  return (await response.json()).data;
}

async function report(owner: LocalMember, runId: string) {
  const response = await stack.request(`matches/${runId}`, owner);
  expect(response.status).toBe(200);
  return matchRunSchema.parse((await response.json()).data);
}

async function identityState(userId: string) {
  const rows = await stack.sql.query(
    "select t.status, t.failure_category, t.result_ref, r.state reservation from public.identity_tasks t join public.usage_reservations r on r.task_id=t.id where t.user_id=$1 and t.feature='matching'",
    [userId],
  );
  return rows.rows[0];
}

beforeAll(async () => {
  stack = await LocalFixtures.open();
  admin = await stack.member(true);
  fixtures = new MatchingFixtures(stack, admin);
  for (let n = 0; n < 3; n++) tiedJobs.push((await fixtures.publishJob()).id);
  const approved = await stack.request("identity/admin/ai-recipients", admin, "POST", {
    purpose: "matching",
    recipient,
    reason: "Reviewed synthetic ranking route",
  });
  expect(approved.status).toBe(201);
});
afterAll(async () => {
  if (!stack) return;
  await stack.sql.query("delete from public.ai_recipient_approvals where recipient=$1", [
    recipient,
  ]);
  await fixtures.cleanup(stack.users.map((user) => user.id));
  await stack.close();
});

it("applies semantic order only within structural ties, records usage and consumes one allowance", async () => {
  const owner = await fixtures.ownerWithEvidence();
  await consent(owner);
  const task = await request(owner, true);
  expect(task.semantic).toEqual({ state: "reserved", code: null });
  const lease = await fixtures.lease(task.taskId);
  await handler(reverseScores).execute(lease, signal());

  const run = await report(owner, task.runId);
  expect(run.ranking).toEqual({
    recipe: "rules-v1+semantic-rank-v1",
    state: "applied",
    code: null,
  });
  const mine = run.data
    .filter((result) => tiedJobs.includes(result.jobId))
    .map((result) => result.jobId);
  expect(mine).toEqual([...tiedJobs].sort().reverse());
  expect(run.data.every((result) => result.recipe === "rules-v1")).toBe(true);
  expect(run.data[0].limitations.join(" ")).toContain("semantic-rank-v1");
  expect(await identityState(owner.id)).toMatchObject({
    status: "succeeded",
    result_ref: task.runId,
    reservation: "consumed",
  });
  const recorded = await stack.sql.query(
    "select g.state from public.gateway_results g join public.identity_tasks t on t.id=g.task_id where t.user_id=$1",
    [owner.id],
  );
  expect(recorded.rows).toEqual([{ state: "succeeded" }]);
});

it("keeps the rules report when consent is missing and never reserves budget", async () => {
  const owner = await fixtures.ownerWithEvidence();
  const task = await request(owner, true);
  expect(task.semantic).toEqual({ state: "unavailable", code: "RF_CONSENT_REQUIRED" });
  await handler(reverseScores).execute(await fixtures.lease(task.taskId), signal());
  const run = await report(owner, task.runId);
  expect(run.ranking).toEqual({ recipe: "rules-v1", state: "not-requested", code: null });
  const mine = run.data
    .filter((result) => tiedJobs.includes(result.jobId))
    .map((result) => result.jobId);
  expect(mine).toEqual([...tiedJobs].sort());
  expect(await identityState(owner.id)).toBeUndefined();
});

it("releases the reservation when the deployment has no ranking route", async () => {
  const owner = await fixtures.ownerWithEvidence();
  await consent(owner);
  const task = await request(owner, true);
  await handler(null).execute(await fixtures.lease(task.taskId), signal());
  expect((await report(owner, task.runId)).ranking).toEqual({
    recipe: "rules-v1",
    state: "fallback",
    code: "RF_GATEWAY_DISABLED",
  });
  expect(await identityState(owner.id)).toMatchObject({
    status: "failed",
    failure_category: "canceled",
    reservation: "released",
  });
});

it("falls back to rules order on provider failure and marks the allowance refundable", async () => {
  const owner = await fixtures.ownerWithEvidence();
  await consent(owner);
  const task = await request(owner, true);
  await handler([{ fail: "unavailable" }]).execute(await fixtures.lease(task.taskId), signal());
  const run = await report(owner, task.runId);
  expect(run.ranking).toEqual({
    recipe: "rules-v1",
    state: "fallback",
    code: "RF_PROVIDER_UNAVAILABLE",
  });
  expect(
    run.data.filter((result) => tiedJobs.includes(result.jobId)).map((result) => result.jobId),
  ).toEqual([...tiedJobs].sort());
  expect(await identityState(owner.id)).toMatchObject({
    status: "failed",
    failure_category: "infrastructure",
    reservation: "consumed",
  });
});

it("rejects forged ranking metadata at publication", async () => {
  const owner = await fixtures.ownerWithEvidence();
  const task = await request(owner, false);
  const lease = await fixtures.lease(task.taskId);
  const forged = await stack.privileged.rpc("matching_publish_ranked", {
    p_task: lease.taskId,
    p_token: lease.token,
    p_results: [],
    p_ranking: {
      recipe: "rules-v1+semantic-rank-v1",
      state: "applied",
      code: null,
      identityTaskId: crypto.randomUUID(),
    },
  });
  expect(forged.error?.message).toBe("RF_INVALID_INPUT");
  for (const client of [owner.client, admin.client])
    expect(
      (await client.rpc("matching_semantic_task", { p_task: lease.taskId, p_token: lease.token }))
        .error,
    ).toBeTruthy();
});
