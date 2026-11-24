import { describe, expect, it } from "vitest";
import {
  fitsAnalysisKey,
  planOptionalAnalysis,
  runOptionalAnalysis,
  withOptionalAnalysis,
  type AnalysisLifecycle,
} from "../../src/modules/gateway/analysis";
import { ApplicationError } from "../../src/modules/platform/errors";

const actor = { userId: "00000000-0000-4000-8000-000000000001", role: "member" as const };
const signal = new AbortController().signal;

describe("optional analysis lifecycle", () => {
  it("falls back instead of failing the domain task when the identity task cannot start", async () => {
    const calls: string[] = [];
    const lifecycle: AnalysisLifecycle = {
      start: async () => {
        throw new Error("RF_CONFLICT");
      },
      finish: async () => void calls.push("finish"),
      fail: async () => void calls.push("fail"),
      release: async () => void calls.push("release"),
    };
    const outcome = await runOptionalAnalysis(
      {
        lifecycle,
        gateway: {
          run: async () => {
            throw new Error("must not run");
          },
          record: async () => {},
        },
      },
      "00000000-0000-4000-8000-000000000002",
      {
        needed: true,
        notNeededCode: "RF_X",
        request: () => {
          throw new Error("must not build");
        },
      },
      signal,
    );
    expect(outcome).toEqual({ kind: "fallback", code: "RF_ANALYSIS_UNAVAILABLE" });
    expect(calls).toEqual([]);
  });

  it("releases a reservation only when the domain request was definitively rejected", async () => {
    const released: string[] = [];
    const reservations = {
      reserveAnalysis: async () => ({ taskId: "t" }),
      releaseAnalysis: async (taskId: string) => void released.push(taskId),
    };
    const reserved = { state: "reserved" as const, code: null, taskId: "t" };
    const attempt = (error: unknown) =>
      withOptionalAnalysis(reservations, reserved, async () => {
        throw error;
      }).catch(() => undefined);
    // Another request with the same key may own the reservation.
    await attempt(new ApplicationError("RF_CONFLICT", 409, "Changed"));
    // Transport or server failures are ambiguous: the record may have committed.
    await attempt(new Error("fetch failed"));
    await attempt(new ApplicationError("RF_UNAVAILABLE", 503, "Unavailable"));
    expect(released).toEqual([]);
    await attempt(new ApplicationError("RF_MATCH_LIMIT", 409, "Too large"));
    expect(released).toEqual(["t"]);
  });

  it("uses a distinct opted-in domain key and falls back to the plain key when it cannot fit", async () => {
    const seen: string[] = [];
    const reservations = {
      reserveAnalysis: async (_a: unknown, input: { idempotencyKey: string }) => {
        seen.push(input.idempotencyKey);
        return { taskId: "t" };
      },
      releaseAnalysis: async () => {},
    };
    const plain = await planOptionalAnalysis(reservations, actor, {
      optedIn: false,
      feature: "matching",
      prefix: "matching",
      requestKey: "key-12345678",
    });
    expect(plain).toEqual({
      analysis: { state: "not-requested", code: null, taskId: null },
      domainKey: "key-12345678",
    });
    const opted = await planOptionalAnalysis(reservations, actor, {
      optedIn: true,
      feature: "matching",
      prefix: "matching",
      requestKey: "key-12345678",
    });
    expect(opted.domainKey).toBe("key-12345678:ai");
    expect(seen).toEqual(["matching:key-12345678:ai"]);
    const long = "k".repeat(190);
    const tooLong = await planOptionalAnalysis(reservations, actor, {
      optedIn: true,
      feature: "matching",
      prefix: "matching",
      requestKey: long,
    });
    expect(tooLong).toEqual({
      analysis: { state: "unavailable", code: "RF_NOT_CONFIGURED", taskId: null },
      domainKey: long,
    });
    // The longer of the identity key and input version must fit 200 characters.
    expect(fitsAnalysisKey("matching", "k".repeat(187))).toBe(true);
    expect(fitsAnalysisKey("matching", "k".repeat(188))).toBe(false);
  });
});

describe("input preparation fixes", () => {
  it("keeps dotted date ranges while removing phone numbers", async () => {
    const { minimizeText } = await import("../../src/modules/gateway/prompt");
    const text = minimizeText("Engineer 2019.01 - 2023.12, call 0912-345-678.");
    expect(text).toContain("2019.01 - 2023.12");
    expect(text).not.toContain("0912");
  });

  it("selects whole facts within a text budget and keeps the owner's language", async () => {
    const { wordingRequest, wordingBounds } = await import("../../src/modules/resume/wording");
    const fact = (n: number, text: string) => ({
      id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      text,
      kind: "experience" as const,
      state: "completed" as const,
      skillIds: [],
      sourceBlockId: null,
    });
    const facts = Array.from({ length: 10 }, (_, n) => fact(n + 1, "x".repeat(3900)));
    facts.push(fact(50, "於 2023 年建立文件問答原型，服務 5 個部門。"));
    const request = wordingRequest(
      {
        version: {
          id: fact(90, "").id,
          documentId: fact(91, "").id,
          version: 1,
          createdAt: "",
          content: {
            facts,
            sections: [{ id: fact(92, "").id, heading: "H", factIds: facts.map((f) => f.id) }],
          },
        },
        target: { jobId: fact(93, "").id, jobVersionId: fact(94, "").id, skillIds: [] },
      },
      {
        identityTaskId: fact(95, "").id,
        ownerId: fact(96, "").id,
        inputVersion: "v",
        jobTitle: "Role",
        requirements: [],
      },
    );
    const total = request.segments.reduce((sum, segment) => sum + segment.text.length, 0);
    expect(total).toBeLessThanOrEqual(wordingBounds.factChars);
    expect(
      request.segments.every(
        (segment) => facts.find((f) => f.id === segment.ref)!.text === segment.text,
      ),
    ).toBe(true);
    expect(request.locale).toBe("zh-TW");
  });
});
