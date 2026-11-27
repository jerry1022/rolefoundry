import { describe, expect, it } from "vitest";
import {
  applySemanticTiebreak,
  rankMatches,
  rulesOnlyLimitation,
  semanticOrderLimitation,
} from "../../src/modules/matching/rules";
import {
  SemanticRanker,
  semanticBounds,
  semanticRequest,
  tiedJobs,
  type AnalysisLifecycle,
  type SemanticGateway,
  type SemanticLink,
} from "../../src/modules/matching/semantic";
import { MatchingService } from "../../src/modules/matching/service";
import type { MatchEvidence, MatchJobInput, MatchSnapshot } from "../../src/modules/matching/model";
import type { GatewayResult } from "../../src/modules/gateway/model";
import type { RankOutput } from "../../src/modules/gateway/recipes";
import { ApplicationError } from "../../src/modules/platform/errors";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const job = (
  n: number,
  skills: string[],
  overrides: Partial<MatchJobInput> = {},
): MatchJobInput => ({
  id: id(n),
  versionId: id(100 + n),
  title: `Role ${n}`,
  company: "Fixture",
  track: "Engineering & data",
  workplace: null,
  level: null,
  conditions: { workAuthorization: null, education: null, experienceYears: null },
  requirements: skills.map((skill) => ({
    text: `Uses ${skill}`,
    priority: "mandatory" as const,
    skills: [skill],
  })),
  ...overrides,
});
const evidence = (skill: string, signal: MatchEvidence["signal"] = "claim"): MatchEvidence => ({
  id: crypto.randomUUID(),
  versionId: crypto.randomUUID(),
  label: `${skill} evidence`,
  context: `Worked with ${skill}`,
  source: signal === "practice" || signal === "support" ? "scenario" : "self-report",
  signal,
  skills: [skill],
  sourceVersion: "1",
  rubricVersion: signal === "practice" || signal === "support" ? "r1" : null,
});
const snapshot = (jobs: MatchJobInput[], items: MatchEvidence[]): MatchSnapshot => ({
  profileRevision: 1,
  catalogRevision: 1,
  dictionaryVersion: 1,
  track: "Engineering & data",
  workplaces: [],
  constraints: { experienceYears: null, confirmations: [] },
  evidence: items,
  jobs,
});
// Jobs 1-3 tie (full python coverage); job 4 is structurally lower (sql uncovered).
const input = snapshot(
  [job(3, ["python"]), job(1, ["python"]), job(2, ["python"]), job(4, ["sql"])],
  [evidence("python"), evidence("python", "practice"), evidence("rag", "learning")],
);
const link: SemanticLink = {
  identityTaskId: id(900),
  ownerId: id(901),
  inputVersion: "matching-key:k",
};

describe("semantic tie-breaking", () => {
  it("only reorders inside structural tiers and keeps unscored ties in rules order", () => {
    const ranked = rankMatches(input);
    expect(ranked.map((r) => r.jobId)).toEqual([id(1), id(2), id(3), id(4)]);
    expect(tiedJobs(ranked).map((r) => r.jobId)).toEqual([id(1), id(2), id(3)]);
    const scores = new Map([
      [id(4), 1],
      [id(3), 0.9],
      [id(1), 0.2],
    ]);
    const reordered = applySemanticTiebreak(ranked, scores).map((r) => r.jobId);
    // Job 4 cannot jump its tier despite the highest score; job 2 (unscored) follows scored ties.
    expect(reordered).toEqual([id(3), id(1), id(2), id(4)]);
  });

  it("builds bounded, minimized requests from positive evidence and tied jobs only", () => {
    const request = semanticRequest(input, tiedJobs(rankMatches(input)), link);
    expect(request).toMatchObject({
      taskId: link.identityTaskId,
      ownerId: link.ownerId,
      purpose: "matching.semantic-rank",
    });
    expect(request.segments.filter((s) => s.label === "job").map((s) => s.ref)).toEqual([
      id(1),
      id(2),
      id(3),
    ]);
    expect(request.segments.filter((s) => s.label === "evidence")).toHaveLength(1);
    expect(request.allowedRefs).toEqual(request.segments.map((s) => s.ref));
    const many = snapshot(
      Array.from({ length: 40 }, (_, n) =>
        job(n + 1, ["python"], {
          requirements: [{ text: "x".repeat(5000), priority: "mandatory", skills: ["python"] }],
        }),
      ),
      Array.from({ length: 80 }, () => evidence("python")),
    );
    const bounded = semanticRequest(many, tiedJobs(rankMatches(many)), link);
    expect(bounded.segments.filter((s) => s.label === "job")).toHaveLength(semanticBounds.jobs);
    expect(bounded.segments.filter((s) => s.label === "evidence")).toHaveLength(
      semanticBounds.evidence,
    );
    expect(Math.max(...bounded.segments.map((s) => s.text.length))).toBeLessThanOrEqual(
      semanticBounds.jobChars,
    );
  });
});

function lifecycle(start: "running" | "failed" = "running") {
  const calls: string[] = [];
  const value: AnalysisLifecycle = {
    start: async () => {
      calls.push("start");
      return start;
    },
    finish: async (_id, ref) => void calls.push(`finish:${ref}`),
    fail: async (_id, category) => void calls.push(`fail:${category}`),
    release: async () => void calls.push("release"),
  };
  return { value, calls };
}
function gateway(result: Partial<GatewayResult<RankOutput>>) {
  const recorded: string[] = [];
  const value: SemanticGateway = {
    rank: async (request) =>
      ({
        state: "succeeded",
        output: null,
        code: null,
        taskId: request.taskId,
        attempts: [],
        ...result,
      }) as GatewayResult<RankOutput>,
    record: async (r) => void recorded.push(r.state),
  };
  return { value, recorded };
}
const signal = new AbortController().signal;

describe("semantic ranker", () => {
  const ranked = rankMatches(input);

  it("applies scores, labels the recipe and finishes the identity task only after publication", async () => {
    const life = lifecycle();
    const gate = gateway({
      output: { ranking: [{ jobRef: id(2), score: 0.9, evidenceRefs: [] }] },
    });
    const order = await new SemanticRanker(life.value, gate.value).order(
      input,
      ranked,
      link,
      signal,
    );
    expect(order.ranking).toEqual({
      recipe: "rules-v1+semantic-rank-v1",
      state: "applied",
      code: null,
      identityTaskId: link.identityTaskId,
    });
    expect(order.results.map((r) => r.jobId)).toEqual([id(2), id(1), id(3), id(4)]);
    expect(order.results[0].limitations).toContain(semanticOrderLimitation);
    expect(order.results[0].limitations).not.toContain(rulesOnlyLimitation);
    expect(life.calls).toEqual(["start"]);
    expect(gate.recorded).toEqual(["succeeded"]);
    await order.finalize(id(77), signal);
    expect(life.calls).toEqual(["start", `finish:${id(77)}`]);
  });

  it("keeps rules order without a reservation and releases unused budget", async () => {
    const none = await new SemanticRanker(lifecycle().value, gateway({}).value).order(
      input,
      ranked,
      null,
      signal,
    );
    expect(none).toMatchObject({
      results: ranked,
      ranking: { state: "not-requested", recipe: "rules-v1" },
    });

    const disabled = lifecycle();
    const off = await new SemanticRanker(disabled.value, null).order(input, ranked, link, signal);
    expect(off.ranking).toMatchObject({ state: "fallback", code: "RF_GATEWAY_DISABLED" });
    expect(disabled.calls).toEqual(["release"]);

    const untied = snapshot([job(1, ["python"]), job(2, ["sql"])], [evidence("python")]);
    const noTies = lifecycle();
    const order = await new SemanticRanker(noTies.value, gateway({}).value).order(
      untied,
      rankMatches(untied),
      link,
      signal,
    );
    expect(order.ranking).toMatchObject({ state: "fallback", code: "RF_SEMANTIC_NOT_NEEDED" });
    expect(noTies.calls).toEqual(["release"]);
  });

  it("falls back with the gateway code and the correct budget outcome", async () => {
    for (const [state, code, expected] of [
      ["provider-failed", "RF_PROVIDER_TIMEOUT", ["start", "fail:infrastructure"]],
      ["invalid-reference", "RF_GATEWAY_INVALID_REFERENCE", ["start", "fail:validation"]],
      ["rejected", "RF_RECIPIENT_NOT_APPROVED", ["start", "fail:validation"]],
      // Consent revocation already failed the identity task; nothing more to record.
      ["stale", "RF_STALE", ["start"]],
    ] as const) {
      const life = lifecycle();
      const order = await new SemanticRanker(life.value, gateway({ state, code }).value).order(
        input,
        ranked,
        link,
        signal,
      );
      expect(order.ranking).toMatchObject({ recipe: "rules-v1", state: "fallback", code });
      expect(order.results).toBe(ranked);
      expect(life.calls).toEqual(expected);
    }
    const revoked = await new SemanticRanker(lifecycle("failed").value, gateway({}).value).order(
      input,
      ranked,
      link,
      signal,
    );
    expect(revoked.ranking).toMatchObject({ code: "RF_CONSENT_REQUIRED" });
    await expect(
      new SemanticRanker(
        lifecycle().value,
        gateway({ state: "cancelled", code: "RF_CANCELLED" }).value,
      ).order(input, ranked, link, signal),
    ).rejects.toThrow();
  });

  it("does not lose a valid ranking when the audit record fails", async () => {
    const failingRecord: SemanticGateway = {
      ...gateway({ output: { ranking: [] } }).value,
      record: async () => {
        throw new Error("record down");
      },
    };
    const order = await new SemanticRanker(lifecycle().value, failingRecord).order(
      input,
      ranked,
      link,
      signal,
    );
    expect(order.ranking.state).toBe("applied");
  });
});

describe("opt-in reservation", () => {
  const actor = { userId: id(500), role: "member" } as never;
  const repository = (fail = false) => ({
    refresh: async () => {
      if (fail) throw new ApplicationError("RF_MATCH_LIMIT", 409, "Too large");
      return { runId: id(600), taskId: id(601), status: "queued" as const };
    },
    find: async () => ({}) as never,
    list: async () => ({}) as never,
  });
  const auth = { authorize: async () => {} };
  const body = { jobId: null, constraints: { experienceYears: null, confirmations: [] } };

  it("reserves before creating the run with stable keys, and reports unavailability without blocking", async () => {
    const seen: { resourceId: string; inputVersion: string; idempotencyKey: string }[] = [];
    const reservations = {
      reserveAnalysis: async (_a: unknown, input: (typeof seen)[number]) => {
        seen.push(input);
        return { taskId: id(700) };
      },
      releaseAnalysis: async () => {},
    };
    const service = new MatchingService(repository(), auth, reservations as never);
    const first = await service.refresh(actor, { ...body, semantic: true }, "key-12345678");
    await service.refresh(actor, { ...body, semantic: true }, "key-12345678");
    expect(first.semantic).toEqual({ state: "reserved", code: null });
    expect(seen[0]).toEqual(seen[1]);
    expect(seen[0]).toMatchObject({
      inputVersion: "matching-key:key-12345678",
      idempotencyKey: "matching:key-12345678",
    });
    expect(seen[0].resourceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    const denied = new MatchingService(repository(), auth, {
      reserveAnalysis: async () => {
        throw new ApplicationError("RF_CONSENT_REQUIRED", 403, "Consent required");
      },
      releaseAnalysis: async () => {},
    });
    expect(
      (await denied.refresh(actor, { ...body, semantic: true }, "key-12345678")).semantic,
    ).toEqual({ state: "unavailable", code: "RF_CONSENT_REQUIRED" });
    expect((await denied.refresh(actor, body, "key-12345678")).semantic).toEqual({
      state: "not-requested",
      code: null,
    });
  });

  it("returns the reservation when the run cannot be created", async () => {
    const released: string[] = [];
    const service = new MatchingService(repository(true), auth, {
      reserveAnalysis: async () => ({ taskId: id(800) }),
      releaseAnalysis: async (taskId: string) => void released.push(taskId),
    });
    await expect(
      service.refresh(actor, { ...body, semantic: true }, "key-12345678"),
    ).rejects.toMatchObject({ code: "RF_MATCH_LIMIT" });
    expect(released).toEqual([id(800)]);
  });
});
