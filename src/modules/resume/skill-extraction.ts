import type { GatewayRequest } from "../gateway/model";
import type { SkillExtractionOutput } from "../gateway/recipes";

/**
 * Model-assisted skill extraction for confirmed resume facts, built as a grounded core plus a
 * calibration harness. It is not connected to the resume studio: suggestions must first agree
 * with reviewed labels (`extractionPasses`), and owners would still confirm every link.
 */
export interface ExtractionSkill {
  id: string;
  nameEn: string;
  nameZhTw: string;
}
export interface ExtractionFact {
  id: string;
  text: string;
}

export function skillExtractionRequest(
  facts: readonly ExtractionFact[],
  skills: readonly ExtractionSkill[],
  ids: { taskId: string; ownerId: string; inputVersion: string; locale: "en" | "zh-TW" },
): GatewayRequest {
  const { locale, ...rest } = ids;
  return {
    ...rest,
    purpose: "resume.skill-extraction",
    templateVersion: "skill-extraction-v1",
    locale,
    instructions: "Assign reviewed skills to each confirmed fact.",
    segments: [
      ...skills.map((skill) => ({
        ref: skill.id,
        label: "skill",
        text: `${skill.nameEn} / ${skill.nameZhTw}`,
      })),
      ...facts.map((fact) => ({ ref: fact.id, label: "fact", text: fact.text })),
    ],
    allowedRefs: [...skills.map((skill) => skill.id), ...facts.map((fact) => fact.id)],
  };
}

/** `factId:skillId` pairs; facts the model omits contribute no predicted pairs. */
export function extractedPairs(output: SkillExtractionOutput) {
  return new Set(
    output.facts.flatMap((fact) => fact.skills.map((skill) => `${fact.factRef}:${skill.skillRef}`)),
  );
}

/** Reviewed agreement required before suggestions may be offered to owners. */
export const extractionEnablementGate = {
  minPrecision: 0.9,
  minRecall: 0.7,
  minFacts: 30,
  maxUngraded: 0,
} as const;

export interface ExtractionReport {
  facts: number;
  batches: number;
  ungradedBatches: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
}

/**
 * Micro-averaged precision/recall over fact-skill pairs. A failed batch counts every reviewed pair
 * in it as missed, so provider failures lower recall instead of disappearing from the report.
 */
export function scoreExtraction(
  batches: {
    expected: ReadonlySet<string>;
    predicted: ReadonlySet<string> | null;
    facts: number;
  }[],
): ExtractionReport {
  let tp = 0,
    fp = 0,
    fn = 0;
  for (const batch of batches) {
    const predicted = batch.predicted ?? new Set<string>();
    for (const pair of predicted) batch.expected.has(pair) ? tp++ : fp++;
    for (const pair of batch.expected) if (!predicted.has(pair)) fn++;
  }
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  return {
    facts: batches.reduce((sum, batch) => sum + batch.facts, 0),
    batches: batches.length,
    ungradedBatches: batches.filter((batch) => batch.predicted === null).length,
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    precision,
    recall,
    f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
  };
}

export function extractionPasses(report: ExtractionReport) {
  const gate = extractionEnablementGate;
  return (
    report.facts >= gate.minFacts &&
    report.ungradedBatches <= gate.maxUngraded &&
    report.precision >= gate.minPrecision &&
    report.recall >= gate.minRecall
  );
}

export interface ReviewedResume {
  id: string;
  locale: "en" | "zh-TW";
  /** Reviewed labels: skill ID → evidence span from that fact. */
  facts: (ExtractionFact & { labels: Record<string, string> })[];
}

export type SkillExtractor = (
  request: GatewayRequest,
  signal: AbortSignal,
) => Promise<{ state: string; code: string | null; output: SkillExtractionOutput | null }>;

/** Runs each reviewed resume as one batch through the extractor and scores the result. */
export async function runExtractionCalibration(
  extract: SkillExtractor,
  resumes: readonly ReviewedResume[],
  skills: readonly ExtractionSkill[],
  signal: AbortSignal,
) {
  const batches: Parameters<typeof scoreExtraction>[0] = [];
  const results: { id: string; state: string; code: string | null }[] = [];
  for (const resume of resumes) {
    const result = await extract(
      skillExtractionRequest(resume.facts, skills, {
        taskId: crypto.randomUUID(),
        ownerId: crypto.randomUUID(),
        inputVersion: `calibration:${resume.id}`,
        locale: resume.locale,
      }),
      signal,
    );
    results.push({ id: resume.id, state: result.state, code: result.code });
    batches.push({
      facts: resume.facts.length,
      expected: new Set(
        resume.facts.flatMap((fact) =>
          Object.keys(fact.labels).map((skill) => `${fact.id}:${skill}`),
        ),
      ),
      predicted:
        result.state === "succeeded" && result.output ? extractedPairs(result.output) : null,
    });
  }
  const report = scoreExtraction(batches);
  return { report, passes: extractionPasses(report), results };
}
