import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import { LocalFixtures, type LocalMember } from "../support/local-fixtures";
import { MatchingFixtures } from "../support/matching-fixtures";
import { leaseTask } from "../support/task-fixtures";
import { ResumeRevisionHandler } from "../../src/modules/resume/handler";
import { ConfirmedFactOrderReviser } from "../../src/modules/resume/adapters/rules";
import { SupabaseResumeRevisionStore } from "../../src/modules/resume/adapters/execution";
import { WordingStage } from "../../src/modules/resume/wording";
import {
  proposalSchema,
  resumeDocumentSchema,
  type ResumeDocument,
} from "../../src/modules/resume/model";
import { IdentityAnalysisLifecycle } from "../../src/modules/gateway/adapters/identity-lifecycle";
import {
  SupabaseGatewayAuthority,
  SupabaseGatewayRecorder,
} from "../../src/modules/gateway/adapters/supabase";
import { AIGateway } from "../../src/modules/gateway/service";
import { FakeAdapter, type FakeStep } from "../../src/modules/gateway/adapters/fake";
import { parseGatewayPolicy } from "../../src/modules/gateway/policy";
import { gatewayTemplates, wordingSpec } from "../../src/modules/gateway/recipes";
import type { AdapterCall } from "../../src/modules/gateway/ports";

vi.mock("server-only", () => ({}));

let stack: LocalFixtures, admin: LocalMember, fixtures: MatchingFixtures, jobId: string;
const recipient = `fake-word-${crypto.randomUUID().slice(0, 8)}`;
const documents: string[] = [];
const signal = () => new AbortController().signal;
const factText = "Built a retrieval prototype used by 3 internal teams in 2023.";

/** Rewrites every fact it receives, keeping the numbers. */
function rewrite(call: AdapterCall): FakeStep {
  const payload = JSON.parse(call.messages[1].content) as { data: { ref: string; text: string }[] };
  return {
    text: JSON.stringify({
      suggestions: payload.data.map((item) => ({
        factRef: item.ref,
        text: `Delivered: ${item.text}`,
        rationale: "Leads with the outcome.",
      })),
    }),
  };
}

function handler(step: FakeStep[] | ((call: AdapterCall) => FakeStep) | null) {
  const store = new SupabaseResumeRevisionStore(stack.privileged);
  const gateway =
    step === null
      ? null
      : new AIGateway({
          policy: parseGatewayPolicy(
            JSON.stringify({
              routes: {
                "resume.wording": {
                  primary: { adapter: recipient, model: "fake-model", recipients: [recipient] },
                  deadlineMs: 5000,
                  primaryAttempts: 1,
                  maxInputChars: 20000,
                  maxOutputTokens: 2000,
                  concurrency: 1,
                },
              },
            }),
          ),
          adapters: [new FakeAdapter(recipient, step)],
          templates: gatewayTemplates,
          authority: new SupabaseGatewayAuthority(stack.privileged),
        });
  const recorder = new SupabaseGatewayRecorder(stack.privileged);
  return new ResumeRevisionHandler(store, new ConfirmedFactOrderReviser(), {
    store,
    stage: new WordingStage(
      new IdentityAnalysisLifecycle(stack.privileged),
      gateway && {
        run: (request, runSignal) => gateway.execute(request, wordingSpec, runSignal),
        record: (result, recordSignal) => recorder.record(result, recordSignal),
      },
    ),
  });
}

async function drainWorker() {
  const code = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "apps/worker/src/main.ts", "--drain"],
      {
        env: {
          ...process.env,
          SUPABASE_URL: stack.env.API_URL,
          SUPABASE_SERVICE_ROLE_KEY: stack.env.SERVICE_ROLE_KEY,
        },
        stdio: "ignore",
      },
    );
    child.on("error", reject);
    child.on("close", resolve);
  });
  expect(code).toBe(0);
}

/** A member with one confirmed two-fact version (one fact is a contact detail). */
async function confirmedResume(owner: LocalMember): Promise<ResumeDocument> {
  const pasted = await stack.request(
    "resumes/paste",
    owner,
    "POST",
    { text: `${factText}\n\nsample@example.test` },
    { "Idempotency-Key": crypto.randomUUID() },
  );
  expect(pasted.status).toBe(202);
  const { documentId } = (await pasted.json()).data;
  documents.push(documentId);
  await drainWorker();
  const document = resumeDocumentSchema.parse(
    (await (await stack.request(`resumes/${documentId}`, owner)).json()).data,
  );
  const [first, second] = document.draft!.blocks;
  const facts = [
    {
      id: crypto.randomUUID(),
      text: factText,
      kind: "project",
      state: "completed",
      skillIds: ["rag"],
      sourceBlockId: first.id,
    },
    {
      id: crypto.randomUUID(),
      text: "sample@example.test",
      kind: "contact",
      state: "unspecified",
      skillIds: [],
      sourceBlockId: second.id,
    },
  ];
  const confirmed = await stack.request(`resumes/${documentId}/confirm`, owner, "POST", {
    expectedRevision: document.revision,
    content: {
      facts,
      sections: [{ id: crypto.randomUUID(), heading: "Projects", factIds: facts.map((f) => f.id) }],
    },
  });
  expect(confirmed.status).toBe(200);
  return resumeDocumentSchema.parse((await confirmed.json()).data);
}

async function consent(owner: LocalMember) {
  const policies = (await owner.client.rpc("identity_policies")).data as {
    purpose: string;
    version: string;
  }[];
  const version = policies.find((policy) => policy.purpose === "resume")!.version;
  expect(
    (
      await owner.client.rpc("identity_grant_consent", {
        p_purpose: "resume",
        p_policy_version: version,
      })
    ).error,
  ).toBeNull();
}

async function revise(owner: LocalMember, document: ResumeDocument, wording: boolean) {
  const response = await stack.request(
    `resumes/${document.id}/revisions`,
    owner,
    "POST",
    { versionId: document.currentVersion!.id, jobId, expectedRevision: document.revision, wording },
    { "Idempotency-Key": crypto.randomUUID() },
  );
  expect(response.status).toBe(202);
  return (await response.json()).data as {
    id: string;
    taskId: string;
    wording: { state: string; code: string | null };
  };
}

async function proposal(owner: LocalMember, id: string) {
  return proposalSchema.parse(
    (await (await stack.request(`resume-revisions/${id}`, owner)).json()).data,
  );
}

async function reservation(userId: string) {
  return (
    await stack.sql.query(
      "select t.status, t.failure_category, r.state from public.identity_tasks t join public.usage_reservations r on r.task_id=t.id where t.user_id=$1 and t.feature='resume' order by t.created_at desc limit 1",
      [userId],
    )
  ).rows[0];
}

beforeAll(async () => {
  stack = await LocalFixtures.open();
  admin = await stack.member(true);
  fixtures = new MatchingFixtures(stack, admin);
  jobId = (
    await fixtures.publishJob({
      requirements: [{ text: "Build retrieval systems", priority: "mandatory", skills: ["rag"] }],
    })
  ).id;
  expect(
    (
      await stack.request("identity/admin/ai-recipients", admin, "POST", {
        purpose: "resume",
        recipient,
        reason: "Reviewed synthetic wording route",
      })
    ).status,
  ).toBe(201);
});
afterAll(async () => {
  if (!stack) return;
  await stack.sql.query("delete from public.ai_recipient_approvals where recipient=$1", [
    recipient,
  ]);
  await fixtures.cleanup(stack.users.map((user) => user.id));
  await stack.close();
});

it("stores fact-preserving suggestions beside the unchanged order proposal and consumes one allowance", async () => {
  const owner = await stack.member();
  const document = await confirmedResume(owner);
  await consent(owner);
  const task = await revise(owner, document, true);
  expect(task.wording).toEqual({ state: "reserved", code: null });
  await handler(rewrite).execute(await leaseTask(stack, task.taskId, "resume.revise"), signal());

  const read = await proposal(owner, task.id);
  expect(read.status).toBe("succeeded");
  expect(read.output?.recipe).toBe("resume-order-v1");
  expect(read.wording?.state).toBe("applied");
  // Contact facts are never sent or reworded.
  expect(read.wording?.suggestions).toEqual([
    {
      factId: document.currentVersion!.content.facts[0].id,
      text: `Delivered: ${factText}`,
      rationale: "Leads with the outcome.",
    },
  ]);
  // Suggestions never alter the confirmed version.
  const after = resumeDocumentSchema.parse(
    (await (await stack.request(`resumes/${document.id}`, owner)).json()).data,
  );
  expect(after.currentVersion!.id).toBe(document.currentVersion!.id);
  expect(await reservation(owner.id)).toMatchObject({ status: "succeeded", state: "consumed" });
});

it("rejects suggestions that invent numbers and marks the allowance as a validation failure", async () => {
  const owner = await stack.member();
  const document = await confirmedResume(owner);
  await consent(owner);
  const task = await revise(owner, document, true);
  const inflated: FakeStep = {
    text: JSON.stringify({
      suggestions: [
        {
          factRef: document.currentVersion!.content.facts[0].id,
          text: "Built a prototype used by 30 teams.",
          rationale: "x",
        },
      ],
    }),
  };
  await handler([inflated]).execute(await leaseTask(stack, task.taskId, "resume.revise"), signal());
  const read = await proposal(owner, task.id);
  expect(read.output?.recipe).toBe("resume-order-v1");
  expect(read.wording).toEqual({
    state: "fallback",
    code: "RF_GATEWAY_INVALID_REFERENCE",
    suggestions: [],
  });
  expect(await reservation(owner.id)).toMatchObject({
    status: "failed",
    failure_category: "validation",
  });
});

it("creates the order proposal without consent and returns allowance when wording is disabled", async () => {
  const owner = await stack.member();
  const document = await confirmedResume(owner);
  const plain = await revise(owner, document, true);
  expect(plain.wording).toEqual({ state: "unavailable", code: "RF_CONSENT_REQUIRED" });
  await handler(rewrite).execute(await leaseTask(stack, plain.taskId, "resume.revise"), signal());
  expect((await proposal(owner, plain.id)).wording).toEqual({
    state: "not-requested",
    code: null,
    suggestions: [],
  });

  await consent(owner);
  const refreshed = resumeDocumentSchema.parse(
    (await (await stack.request(`resumes/${document.id}`, owner)).json()).data,
  );
  const disabled = await revise(owner, refreshed, true);
  await handler(null).execute(await leaseTask(stack, disabled.taskId, "resume.revise"), signal());
  expect((await proposal(owner, disabled.id)).wording).toMatchObject({
    state: "fallback",
    code: "RF_GATEWAY_DISABLED",
  });
  expect(await reservation(owner.id)).toMatchObject({
    status: "failed",
    failure_category: "canceled",
    state: "released",
  });
});

it("rejects forged wording at publication and erases suggestions with the source", async () => {
  const owner = await stack.member();
  const document = await confirmedResume(owner);
  const task = await revise(owner, document, false);
  const lease = await leaseTask(stack, task.taskId, "resume.revise");
  const load = await stack.privileged.rpc("resume_revision_load", {
    p_task: lease.taskId,
    p_token: lease.token,
  });
  const forged = await stack.privileged.rpc("resume_revision_publish_worded", {
    p_task: lease.taskId,
    p_token: lease.token,
    p_output: {
      recipe: "resume-order-v1",
      versionId: load.data.version.id,
      jobVersionId: load.data.target.jobVersionId,
      changes: [],
      questions: [],
      limitations: [],
    },
    p_wording: {
      state: "applied",
      code: null,
      identityTaskId: null,
      suggestions: [
        {
          factId: document.currentVersion!.content.facts[1].id,
          text: "Reworded contact",
          rationale: "x",
        },
      ],
    },
  });
  expect(forged.error?.message).toBe("RF_INVALID_INPUT");
  for (const client of [owner.client, admin.client])
    expect(
      (await client.rpc("resume_wording_context", { p_task: lease.taskId, p_token: lease.token }))
        .error,
    ).toBeTruthy();

  const removed = await stack.request(`resumes/${document.id}`, owner, "DELETE", {
    expectedRevision: document.revision,
  });
  expect(removed.status).toBe(200);
  const left = await stack.sql.query(
    "select count(*)::int n from public.revision_proposals where document_id=$1 and wording is not null",
    [document.id],
  );
  expect(left.rows[0].n).toBe(0);
});
