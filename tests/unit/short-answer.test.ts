import { describe, expect, it } from "vitest";
import {
  calibrate,
  calibrationPasses,
  reviewedCases,
  runShortAnswerCalibration,
  scoreShortAnswer,
  shortAnswerRequest,
  type ShortAnswerGrader,
  type ShortAnswerRubric,
} from "../../src/modules/assessment/short-answer";
import {
  reviewedShortAnswers,
  shortAnswerRubrics,
} from "../../src/modules/assessment/short-answer-examples";
import { shortAnswerSpec, type ShortAnswerOutput } from "../../src/modules/gateway/recipes";

const rubric: ShortAnswerRubric = {
  questionId: "q",
  locale: "en",
  prompt: "Why hold out validation data?",
  criteria: [
    { id: "c1", description: "Held out", weight: 3 },
    { id: "c2", description: "Generalization", weight: 1 },
  ],
};
const answer = "We keep the validation data separate to estimate generalization.";
const request = shortAnswerRequest(rubric, answer, {
  taskId: "t",
  ownerId: "o",
  inputVersion: "v",
});
const verify = (output: ShortAnswerOutput) =>
  shortAnswerSpec.verify!(shortAnswerSpec.schema.parse(output), request);

describe("short-answer grounding", () => {
  it("accepts verdicts whose quotes appear in the answer, ignoring case and spacing", () => {
    expect(
      verify({
        criteria: [
          { criterionRef: "c1", met: true, quote: "keep the   VALIDATION data separate" },
          { criterionRef: "c2", met: false, quote: null },
        ],
      }),
    ).toBe(true);
  });

  it("rejects a met verdict whose quote the learner never wrote", () => {
    expect(
      verify({
        criteria: [
          { criterionRef: "c1", met: true, quote: "prevents data leakage between splits" },
          { criterionRef: "c2", met: false, quote: null },
        ],
      }),
    ).toBe(false);
  });

  it("rejects missing, duplicated or unknown criteria and trivial or stray quotes", () => {
    const c2 = { criterionRef: "c2", met: false, quote: null };
    expect(verify({ criteria: [c2] })).toBe(false);
    expect(verify({ criteria: [c2, c2] })).toBe(false);
    expect(verify({ criteria: [c2, { criterionRef: "answer", met: false, quote: null }] })).toBe(
      false,
    );
    expect(verify({ criteria: [c2, { criterionRef: "c1", met: true, quote: "we" }] })).toBe(false);
    expect(verify({ criteria: [c2, { criterionRef: "c1", met: false, quote: "We keep" }] })).toBe(
      false,
    );
  });

  it("sends the answer as data and allows only criterion references", () => {
    expect(request.allowedRefs).toEqual(["c1", "c2"]);
    expect(request.segments.at(-1)).toMatchObject({ label: "answer", text: answer });
  });
});

describe("short-answer scoring and calibration", () => {
  it("weights met criteria deterministically", () => {
    expect(scoreShortAnswer(rubric, [{ criterionId: "c1", met: true }])).toBe(0.75);
    expect(scoreShortAnswer(rubric, [])).toBe(0);
  });

  it("reports perfect agreement and counts ungraded cases against it", () => {
    const human = [
      { criterionId: "c1", met: true },
      { criterionId: "c2", met: false },
    ];
    const perfect = calibrate([{ rubric, human, model: human }]);
    expect(perfect).toMatchObject({ criterionAgreement: 1, kappa: 1, meanScoreError: 0 });
    const withFailure = calibrate([
      { rubric, human, model: human },
      { rubric, human, model: null },
    ]);
    expect(withFailure).toMatchObject({
      criterionAgreement: 0.5,
      ungraded: 1,
      meanScoreError: 0.5,
    });
  });

  it("gives chance-level kappa to a grader that always says not met", () => {
    const report = calibrate(
      reviewedCases(shortAnswerRubrics, reviewedShortAnswers).map((item) => ({
        rubric: item.rubric,
        human: item.human,
        model: item.human.map((label) => ({ ...label, met: false })),
      })),
    );
    expect(report.kappa).toBe(0);
    expect(calibrationPasses(report)).toBe(false);
  });
});

describe("reviewed example set", () => {
  const cases = reviewedCases(shortAnswerRubrics, reviewedShortAnswers);

  it("is large enough for the gate, bilingual and balanced", () => {
    expect(cases.length).toBeGreaterThanOrEqual(30);
    const locales = new Set(cases.map((item) => item.rubric.locale));
    expect(locales).toEqual(new Set(["en", "zh-TW"]));
    const labels = cases.flatMap((item) => item.human);
    const met = labels.filter((label) => label.met).length;
    expect(met / labels.length).toBeGreaterThan(0.3);
    expect(met / labels.length).toBeLessThan(0.7);
  });

  it("only cites evidence that the reviewed answer contains", () => {
    for (const example of reviewedShortAnswers)
      for (const evidence of Object.values(example.labels))
        if (evidence !== null) expect(example.answer).toContain(evidence);
  });

  it("passes the gate for a grader that reproduces reviewer evidence", async () => {
    const byVersion = new Map(reviewedShortAnswers.map((item) => [`calibration:${item.id}`, item]));
    const oracle: ShortAnswerGrader = async (graded) => {
      const example = byVersion.get(graded.inputVersion)!;
      const output = {
        criteria: Object.entries(example.labels).map(([criterionRef, quote]) => ({
          criterionRef,
          met: quote !== null,
          quote,
        })),
      };
      expect(shortAnswerSpec.verify!(output, graded)).toBe(true);
      return { state: "succeeded", code: null, output };
    };
    const run = await runShortAnswerCalibration(oracle, cases, new AbortController().signal);
    expect(run.passes).toBe(true);
    expect(run.report.kappa).toBe(1);
  });

  it("rejects examples that skip or invent criteria", () => {
    expect(() =>
      reviewedCases(shortAnswerRubrics, [
        { id: "bad", questionId: "precision-recall", answer: "x", labels: { "pr-recall": null } },
      ]),
    ).toThrow(/every criterion/);
  });
});

describe("quote grounding strength", () => {
  it("rejects trivial or partial-word quotes and accepts whole-word evidence", async () => {
    const { quotedIn } = await import("../../src/modules/gateway/recipes");
    const answer = "We keep the validation data separate; caching is not needed.";
    const min = { words: 2, cjk: 4 };
    expect(quotedIn(answer, "the", min)).toBe(false);
    expect(quotedIn(answer, "ep the validation", min)).toBe(false);
    expect(quotedIn(answer, "keep the VALIDATION data", min)).toBe(true);
    expect(quotedIn("先檢索相關段落再回答", "檢索", min)).toBe(false);
    expect(quotedIn("先檢索相關段落再回答", "檢索相關段落", min)).toBe(true);
    expect(quotedIn("Wrote SQL queries", "SQL", { words: 1, cjk: 2 })).toBe(true);
    expect(quotedIn("Used PostgreSQL daily", "SQL", { words: 1, cjk: 2 })).toBe(false);
  });
});

describe("kappa on one-class labels", () => {
  it("does not let a set with a single label class pass on kappa", () => {
    const human = [
      { criterionId: "c1", met: true },
      { criterionId: "c2", met: true },
    ];
    expect(calibrate([{ rubric, human, model: human }]).kappa).toBe(0);
  });
});
