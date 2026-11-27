import type { GatewayRequest } from "../gateway/model";
import type { ShortAnswerOutput } from "../gateway/recipes";

/**
 * Structured short-answer grading core. Not connected to learner attempts: the design requires
 * calibrating agreement with reviewed examples before any public use, and `calibrationPasses`
 * is that gate.
 */
export interface ShortAnswerRubric {
  questionId: string;
  prompt: string;
  locale: "en" | "zh-TW";
  criteria: { id: string; description: string; weight: number }[];
}

export interface CriterionVerdict {
  criterionId: string;
  met: boolean;
}

export function shortAnswerRequest(
  rubric: ShortAnswerRubric,
  answer: string,
  ids: { taskId: string; ownerId: string; inputVersion: string },
): GatewayRequest {
  const criteria = rubric.criteria.map((criterion) => ({
    ref: criterion.id,
    label: "criterion",
    text: criterion.description,
  }));
  return {
    ...ids,
    purpose: "assessment.short-answer",
    templateVersion: "short-answer-v1",
    locale: rubric.locale,
    instructions: `Question: ${rubric.prompt}`.slice(0, 4000),
    segments: [...criteria, { ref: `${rubric.questionId}-answer`, label: "answer", text: answer }],
    allowedRefs: criteria.map((criterion) => criterion.ref),
  };
}

/** Deterministic score from met criteria and reviewed weights (0..1). */
export function scoreShortAnswer(rubric: ShortAnswerRubric, verdicts: readonly CriterionVerdict[]) {
  const total = rubric.criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  if (!total) return 0;
  const met = new Set(verdicts.filter((item) => item.met).map((item) => item.criterionId));
  return rubric.criteria.reduce((sum, c) => sum + (met.has(c.id) ? c.weight : 0), 0) / total;
}

export const verdictsFromOutput = (output: ShortAnswerOutput): CriterionVerdict[] =>
  output.criteria.map((item) => ({ criterionId: item.criterionRef, met: item.met }));

/** Minimum agreement with human reviewers before short answers may be enabled anywhere. */
export const shortAnswerEnablementGate = {
  minCriterionAgreement: 0.85,
  minKappa: 0.7,
  maxMeanScoreError: 0.15,
  minExamples: 30,
} as const;

export interface CalibrationReport {
  examples: number;
  graded: number;
  /** Share of criterion verdicts equal to the human label. */
  criterionAgreement: number;
  /** Cohen's kappa for met / not met across all criteria. */
  kappa: number;
  meanScoreError: number;
  ungraded: number;
}

/**
 * Compares model verdicts with reviewed human labels. Ungraded examples (provider failure,
 * rejected output) count against agreement rather than being dropped.
 */
export function calibrate(
  cases: {
    rubric: ShortAnswerRubric;
    human: CriterionVerdict[];
    model: CriterionVerdict[] | null;
  }[],
): CalibrationReport {
  let agree = 0,
    total = 0,
    scoreError = 0,
    graded = 0;
  const counts = { tt: 0, tf: 0, ft: 0, ff: 0 };
  for (const item of cases) {
    const model = new Map((item.model ?? []).map((v) => [v.criterionId, v.met]));
    for (const label of item.human) {
      total++;
      const predicted = item.model ? model.get(label.criterionId) : undefined;
      if (predicted === undefined) continue;
      if (predicted === label.met) agree++;
      counts[`${label.met ? "t" : "f"}${predicted ? "t" : "f"}` as keyof typeof counts]++;
    }
    if (item.model) {
      graded++;
      scoreError += Math.abs(
        scoreShortAnswer(item.rubric, item.human) - scoreShortAnswer(item.rubric, item.model),
      );
    } else scoreError += 1;
  }
  const n = counts.tt + counts.tf + counts.ft + counts.ff;
  const observed = n ? (counts.tt + counts.ff) / n : 0;
  const expected = n
    ? ((counts.tt + counts.tf) * (counts.tt + counts.ft) +
        (counts.ff + counts.ft) * (counts.ff + counts.tf)) /
      (n * n)
    : 0;
  return {
    examples: cases.length,
    graded,
    criterionAgreement: total ? agree / total : 0,
    kappa: expected < 1 ? (observed - expected) / (1 - expected) : observed === 1 ? 1 : 0,
    meanScoreError: cases.length ? scoreError / cases.length : 1,
    ungraded: cases.length - graded,
  };
}

export function calibrationPasses(report: CalibrationReport) {
  const gate = shortAnswerEnablementGate;
  return (
    report.examples >= gate.minExamples &&
    report.criterionAgreement >= gate.minCriterionAgreement &&
    report.kappa >= gate.minKappa &&
    report.meanScoreError <= gate.maxMeanScoreError
  );
}

export interface ReviewedCase {
  id: string;
  rubric: ShortAnswerRubric;
  answer: string;
  human: CriterionVerdict[];
}

/** Joins reviewed examples with their rubric; throws on a label that names no criterion. */
export function reviewedCases(
  rubrics: readonly ShortAnswerRubric[],
  examples: readonly {
    id: string;
    questionId: string;
    answer: string;
    labels: Record<string, string | null>;
  }[],
): ReviewedCase[] {
  const byQuestion = new Map(rubrics.map((rubric) => [rubric.questionId, rubric]));
  return examples.map((item) => {
    const rubric = byQuestion.get(item.questionId);
    if (!rubric) throw new Error(`Example ${item.id} names an unknown question.`);
    const ids = rubric.criteria.map((criterion) => criterion.id);
    if (ids.length !== Object.keys(item.labels).length || !ids.every((id) => id in item.labels))
      throw new Error(`Example ${item.id} must label every criterion exactly once.`);
    return {
      id: item.id,
      rubric,
      answer: item.answer,
      human: ids.map((id) => ({ criterionId: id, met: item.labels[id] !== null })),
    };
  });
}

/** Grading port; the CLI binds it to the gateway with `shortAnswerSpec`. */
export type ShortAnswerGrader = (
  request: GatewayRequest,
  signal: AbortSignal,
) => Promise<{ state: string; code: string | null; output: ShortAnswerOutput | null }>;

/** Runs every reviewed case through the grader and reports agreement plus per-case states. */
export async function runShortAnswerCalibration(
  grade: ShortAnswerGrader,
  cases: readonly ReviewedCase[],
  signal: AbortSignal,
) {
  const graded: Parameters<typeof calibrate>[0] = [];
  const results: { id: string; state: string; code: string | null }[] = [];
  for (const item of cases) {
    const request = shortAnswerRequest(item.rubric, item.answer, {
      taskId: crypto.randomUUID(),
      ownerId: crypto.randomUUID(),
      inputVersion: `calibration:${item.id}`,
    });
    const result = await grade(request, signal);
    results.push({ id: item.id, state: result.state, code: result.code });
    graded.push({
      rubric: item.rubric,
      human: item.human,
      model:
        result.state === "succeeded" && result.output ? verdictsFromOutput(result.output) : null,
    });
  }
  const report = calibrate(graded);
  return { report, passes: calibrationPasses(report), results };
}
