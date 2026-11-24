import { z } from "zod";
import type { GatewayRequest } from "./model";
import type { PurposeTemplate } from "./ports";
import type { OutputSpec } from "./service";

/** Reviewed purpose templates. Changing wording requires a new version and re-evaluation. */
export const gatewayTemplates: PurposeTemplate[] = [
  {
    purpose: "resume.wording",
    version: "resume-wording-v1",
    system: [
      "You improve the wording of confirmed resume facts for a specific target role.",
      "Each suggestion rewrites exactly one fact and must preserve every fact it states: employer, role, dates, numbers, tools and outcomes.",
      "Do not add achievements, metrics, technologies, responsibilities or seniority that are not in that fact.",
      "If a fact cannot be improved without adding information, omit it.",
    ].join("\n"),
  },
  {
    purpose: "matching.semantic-rank",
    version: "semantic-rank-v1",
    system: [
      "You rank published jobs by how well the candidate's confirmed evidence supports each job's stated requirements.",
      "Every ranked job must cite the evidence refs that support its score. A job with no supporting evidence gets score 0 and no evidenceRefs.",
      "Do not infer skills that the evidence does not state. Scores are relevance signals, not hiring probabilities.",
    ].join("\n"),
  },
];

const ref = z.string().min(1).max(120);

export const wordingOutput = z
  .object({
    suggestions: z
      .array(
        z
          .object({
            factRef: ref,
            text: z.string().trim().min(1).max(600),
            rationale: z.string().trim().min(1).max(300),
          })
          .strict(),
      )
      .max(32),
  })
  .strict();
export type WordingOutput = z.infer<typeof wordingOutput>;

const numbers = (text: string) =>
  (text.normalize("NFKC").match(/\d+(?:[.,]\d+)*%?/g) ?? []).map((value) =>
    value.replace(/,/g, ""),
  );

/** Every number in a suggestion must appear in the fact it rewrites. */
export function preservesFacts(source: string, suggestion: string) {
  const allowed = new Set(numbers(source));
  return numbers(suggestion).every((value) => allowed.has(value));
}

export const wordingSpec: OutputSpec<WordingOutput> = {
  schema: wordingOutput,
  jsonSchema: {
    name: "resume_wording",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["suggestions"],
      properties: {
        suggestions: {
          type: "array",
          maxItems: 32,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["factRef", "text", "rationale"],
            properties: {
              factRef: { type: "string" },
              text: { type: "string" },
              rationale: { type: "string" },
            },
          },
        },
      },
    },
  },
  references: (output) => output.suggestions.map((item) => item.factRef),
  verify: (output, request: GatewayRequest) => {
    const facts = new Map(request.segments.map((segment) => [segment.ref, segment.text]));
    const seen = new Set<string>();
    return output.suggestions.every((item) => {
      if (seen.has(item.factRef)) return false;
      seen.add(item.factRef);
      const source = facts.get(item.factRef);
      return source !== undefined && preservesFacts(source, item.text);
    });
  },
};

export const rankOutput = z
  .object({
    ranking: z
      .array(
        z
          .object({
            jobRef: ref,
            score: z.number().min(0).max(1),
            evidenceRefs: z.array(ref).max(16),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export type RankOutput = z.infer<typeof rankOutput>;

export const rankSpec: OutputSpec<RankOutput> = {
  schema: rankOutput,
  jsonSchema: {
    name: "semantic_rank",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["ranking"],
      properties: {
        ranking: {
          type: "array",
          maxItems: 100,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["jobRef", "score", "evidenceRefs"],
            properties: {
              jobRef: { type: "string" },
              score: { type: "number" },
              evidenceRefs: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
  },
  references: (output) => output.ranking.flatMap((item) => [item.jobRef, ...item.evidenceRefs]),
  verify: (output, request) => {
    const kinds = new Map(request.segments.map((segment) => [segment.ref, segment.label]));
    const jobs = new Set<string>();
    return output.ranking.every((item) => {
      if (jobs.has(item.jobRef) || kinds.get(item.jobRef) !== "job") return false;
      jobs.add(item.jobRef);
      // A positive score must be grounded in cited evidence, never in the job text alone.
      if (item.score > 0 && !item.evidenceRefs.length) return false;
      return item.evidenceRefs.every((value) => kinds.get(value) === "evidence");
    });
  },
};
