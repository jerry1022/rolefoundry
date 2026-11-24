import { describe, expect, it } from "vitest";
import {
  WordingStage,
  wordingBounds,
  wordingRequest,
  type WordingContext,
} from "../../src/modules/resume/wording";
import { ResumeRevisionHandler } from "../../src/modules/resume/handler";
import { ConfirmedFactOrderReviser } from "../../src/modules/resume/adapters/rules";
import { ResumeService } from "../../src/modules/resume/service";
import type { ResumeRevisionInput } from "../../src/modules/resume/model";
import type { AnalysisLifecycle, OptionalGateway } from "../../src/modules/gateway/analysis";
import type { GatewayResult } from "../../src/modules/gateway/model";
import type { WordingOutput } from "../../src/modules/gateway/recipes";
import { ApplicationError } from "../../src/modules/platform/errors";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const fact = (n: number, text: string, kind: "experience" | "contact" = "experience") => ({
  id: id(n),
  text,
  kind,
  state: "completed" as const,
  skillIds: [],
  sourceBlockId: null,
});
const input = (
  facts = [
    fact(1, "Built a retrieval prototype for 3 teams."),
    fact(2, "jerry@example.test", "contact"),
    fact(3, "Ran weekly SQL reports for 12 managers."),
  ],
): ResumeRevisionInput => ({
  version: {
    id: id(90),
    documentId: id(91),
    version: 1,
    createdAt: "2026-11-24T00:00:00Z",
    content: {
      facts,
      sections: [{ id: id(92), heading: "Experience", factIds: facts.map((f) => f.id) }],
    },
  },
  target: { jobId: id(93), jobVersionId: id(94), skillIds: [] },
});
const context: WordingContext = {
  identityTaskId: id(100),
  ownerId: id(101),
  inputVersion: "resume-wording-key:k",
  jobTitle: "AI Application Engineer",
  requirements: Array.from({ length: 20 }, (_, n) => `Requirement ${n} ${"x".repeat(400)}`),
};
const signal = new AbortController().signal;

function lifecycle(start: "running" | "failed" = "running") {
  const calls: string[] = [];
  const value: AnalysisLifecycle = {
    start: async () => (calls.push("start"), start),
    finish: async (_id, ref) => void calls.push(`finish:${ref}`),
    fail: async (_id, category) => void calls.push(`fail:${category}`),
    release: async () => void calls.push("release"),
  };
  return { value, calls };
}
function gateway(result: Partial<GatewayResult<WordingOutput>>): OptionalGateway<WordingOutput> {
  return {
    run: async (request) =>
      ({
        state: "succeeded",
        output: null,
        code: null,
        taskId: request.taskId,
        attempts: [],
        ...result,
      }) as GatewayResult<WordingOutput>,
    record: async () => {},
  };
}

describe("resume wording stage", () => {
  it("sends only eligible confirmed facts with bounded role context", () => {
    const request = wordingRequest(input(), context);
    expect(request.segments.map((s) => s.ref)).toEqual([id(1), id(3)]);
    expect(JSON.stringify(request)).not.toContain("example.test");
    expect(request.allowedRefs).toEqual([id(1), id(3)]);
    expect(request.instructions.length).toBeLessThanOrEqual(4000);
    expect(request.instructions.split("\n").filter((line) => line.startsWith("- "))).toHaveLength(
      wordingBounds.requirements,
    );
    expect(request).toMatchObject({
      purpose: "resume.wording",
      taskId: context.identityTaskId,
      templateVersion: "resume-wording-v1",
    });
  });

  it("maps suggestions to fact IDs, drops unchanged text and finishes only after publication", async () => {
    const life = lifecycle();
    const result = await new WordingStage(
      life.value,
      gateway({
        output: {
          suggestions: [
            {
              factRef: id(1),
              text: "Delivered a retrieval prototype adopted by 3 teams.",
              rationale: "Outcome first.",
            },
            {
              factRef: id(3),
              text: "Ran weekly SQL reports for 12 managers.",
              rationale: "Already clear.",
            },
          ],
        },
      }),
    ).suggest(input(), context, signal);
    expect(result.wording).toEqual({
      state: "applied",
      code: null,
      identityTaskId: context.identityTaskId,
      suggestions: [
        {
          factId: id(1),
          text: "Delivered a retrieval prototype adopted by 3 teams.",
          rationale: "Outcome first.",
        },
      ],
    });
    expect(life.calls).toEqual(["start"]);
    await result.finalize(id(7), signal);
    expect(life.calls).toEqual(["start", `finish:${id(7)}`]);
  });

  it("returns unused allowance and records fallbacks without blocking the order proposal", async () => {
    const none = await new WordingStage(lifecycle().value, gateway({})).suggest(
      input(),
      null,
      signal,
    );
    expect(none.wording.state).toBe("not-requested");

    const off = lifecycle();
    expect(
      (await new WordingStage(off.value, null).suggest(input(), context, signal)).wording,
    ).toMatchObject({ state: "fallback", code: "RF_GATEWAY_DISABLED" });
    expect(off.calls).toEqual(["release"]);

    const short = lifecycle();
    const tiny = input([fact(1, "SQL"), fact(2, "a@b.test", "contact")]);
    expect(
      (await new WordingStage(short.value, gateway({})).suggest(tiny, context, signal)).wording,
    ).toMatchObject({ code: "RF_WORDING_NOT_NEEDED" });
    expect(short.calls).toEqual(["release"]);

    const invalid = lifecycle();
    expect(
      (
        await new WordingStage(
          invalid.value,
          gateway({ state: "invalid-reference", code: "RF_GATEWAY_INVALID_REFERENCE" }),
        ).suggest(input(), context, signal)
      ).wording,
    ).toMatchObject({ code: "RF_GATEWAY_INVALID_REFERENCE" });
    expect(invalid.calls).toEqual(["start", "fail:validation"]);

    const revoked = await new WordingStage(lifecycle("failed").value, gateway({})).suggest(
      input(),
      context,
      signal,
    );
    expect(revoked.wording).toMatchObject({ code: "RF_CONSENT_REQUIRED" });
  });
});

describe("revision handler with wording", () => {
  const lease = {
    taskId: id(200),
    messageId: "1",
    kind: "resume.revise" as const,
    token: id(201),
    leaseSeconds: 30,
  };

  it("publishes the deterministic order proposal with wording atomically, then finalizes", async () => {
    const calls: string[] = [];
    const store = {
      load: async () => input(),
      publish: async () => void calls.push("publish"),
      wordingContext: async () => context,
      publishWorded: async (
        _l: unknown,
        proposal: { recipe: string },
        wording: { state: string },
      ) => void calls.push(`worded:${proposal.recipe}:${wording.state}`),
    };
    const life = lifecycle();
    const stage = new WordingStage(life.value, gateway({ output: { suggestions: [] } }));
    await new ResumeRevisionHandler(store, new ConfirmedFactOrderReviser(), {
      store,
      stage,
    }).execute(lease, signal);
    expect(calls).toEqual(["worded:resume-order-v1:applied"]);
    expect(life.calls).toEqual(["start", `finish:${lease.taskId}`]);

    calls.length = 0;
    await new ResumeRevisionHandler(store, new ConfirmedFactOrderReviser()).execute(lease, signal);
    expect(calls).toEqual(["publish"]);
  });
});

describe("resume wording reservation", () => {
  const actor = { userId: id(300), role: "member" as const };
  const auth = { authorize: async () => {} };
  const body = { versionId: id(90), jobId: id(93), expectedRevision: 2 };
  function service(
    revise: () => Promise<unknown>,
    reservations?: ConstructorParameters<typeof ResumeService>[4],
  ) {
    return new ResumeService({ revise } as never, {} as never, {} as never, auth, reservations);
  }

  it("reserves before the proposal exists, reports unavailability, and releases on failure", async () => {
    const order: string[] = [];
    const reservations = {
      reserveAnalysis: async (
        _a: unknown,
        input: { feature: string; idempotencyKey: string; inputVersion: string },
      ) => {
        order.push(`reserve:${input.feature}:${input.idempotencyKey}:${input.inputVersion}`);
        return { taskId: id(400) };
      },
      releaseAnalysis: async (taskId: string) => void order.push(`release:${taskId}`),
    };
    const ok = await service(
      async () => (order.push("revise"), { id: id(1), taskId: id(2), status: "queued" }),
      reservations,
    ).revise(actor, id(91), { ...body, wording: true }, "key-12345678");
    expect(order).toEqual([
      "reserve:resume:resume-wording:key-12345678:ai:resume-wording-key:key-12345678:ai",
      "revise",
    ]);
    expect(ok.wording).toEqual({ state: "reserved", code: null });

    const plain = await service(
      async () => ({ id: id(1), taskId: id(2), status: "queued" }),
      reservations,
    ).revise(actor, id(91), body, "key-12345678");
    expect(plain.wording).toEqual({ state: "not-requested", code: null });

    const denied = await service(async () => ({ id: id(1), taskId: id(2), status: "queued" }), {
      reserveAnalysis: async () => {
        throw new ApplicationError("RF_QUOTA_EXCEEDED", 429, "Allowance used");
      },
      releaseAnalysis: async () => {},
    }).revise(actor, id(91), { ...body, wording: true }, "key-12345678");
    expect(denied.wording).toEqual({ state: "unavailable", code: "RF_QUOTA_EXCEEDED" });

    order.length = 0;
    await expect(
      service(async () => {
        throw new ApplicationError("RF_RESUME_LIMIT", 409, "Limit");
      }, reservations).revise(actor, id(91), { ...body, wording: true }, "key-12345678"),
    ).rejects.toMatchObject({ code: "RF_RESUME_LIMIT" });
    expect(order).toEqual([expect.stringMatching(/^reserve:/), `release:${id(400)}`]);
  });
});
