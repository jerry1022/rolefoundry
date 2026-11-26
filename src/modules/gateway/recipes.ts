import { z } from "zod";
import type { GatewayRequest } from "./model";
import type { PurposeTemplate } from "./ports";
import type { OutputSpec } from "./service";

/** Reviewed purpose templates. Changing wording requires a new version and re-evaluation. */
export const gatewayTemplates: PurposeTemplate[] = [
  {
    purpose: "assessment.short-answer",
    version: "short-answer-v1",
    system: [
      "You check a learner's short answer against reviewed rubric criteria.",
      "For each criterion decide whether the answer meets it. When it does, copy the exact words from the answer that show it; when it does not, give no quote.",
      "Judge only what the answer says. Do not reward length, confidence or keywords without the required reasoning, and do not infer unstated knowledge.",
    ].join("\n"),
  },
  {
    purpose: "resume.skill-extraction",
    version: "skill-extraction-v1",
    system: [
      "You identify which reviewed skills each confirmed resume fact demonstrates.",
      "Choose skills only from the provided skill list. For every skill you assign, copy the exact words from that fact that show it.",
      "Assign a skill only when the fact states work that uses it. Do not infer skills from job titles, employers or seniority alone, and omit facts that show no listed skill.",
    ].join("\n"),
  },
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

export const shortAnswerOutput = z
  .object({
    criteria: z
      .array(
        z
          .object({
            criterionRef: ref,
            met: z.boolean(),
            quote: z.string().max(600).nullable(),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();
export type ShortAnswerOutput = z.infer<typeof shortAnswerOutput>;

const normalized = (text: string) =>
  text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

const cjk = /[\u3400-\u9fff\uf900-\ufaff]/u;
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * Whether `quote` appears in `source` as a whole-word span (after NFKC, whitespace and case
 * normalization) with enough content to be evidence: at least `minWords` words, or at least
 * `minCjk` characters when the quote is written in CJK script, which has no word spaces.
 */
export function quotedIn(source: string, quote: string, minimum: { words: number; cjk: number }) {
  const text = normalized(source);
  const span = normalized(quote);
  if (!span) return false;
  if (cjk.test(span))
    return [...span].filter((c) => cjk.test(c)).length >= minimum.cjk && text.includes(span);
  if (span.split(" ").filter((word) => /[\p{L}\p{N}]/u.test(word)).length < minimum.words)
    return false;
  // Word boundaries that also respect non-ASCII letters (\b does not).
  return new RegExp(`(?<![\\p{L}\\p{N}])${escape(span)}(?![\\p{L}\\p{N}])`, "u").test(text);
}

/**
 * Every criterion is judged exactly once; a "met" verdict must quote a whole-word span of the
 * answer (at least two words, or four CJK characters), so the model cannot credit reasoning the
 * learner did not write. Negation and context remain the model's judgement, measured by calibration.
 */
export const shortAnswerSpec: OutputSpec<ShortAnswerOutput> = {
  schema: shortAnswerOutput,
  jsonSchema: {
    name: "short_answer_grading",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["criteria"],
      properties: {
        criteria: {
          type: "array",
          maxItems: 20,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["criterionRef", "met", "quote"],
            properties: {
              criterionRef: { type: "string" },
              met: { type: "boolean" },
              quote: { type: ["string", "null"] },
            },
          },
        },
      },
    },
  },
  references: (output) => output.criteria.map((item) => item.criterionRef),
  verify: (output, request) => {
    const answer = request.segments.find((segment) => segment.label === "answer");
    const criteria = request.segments.filter((segment) => segment.label === "criterion");
    if (!answer || output.criteria.length !== criteria.length) return false;
    const seen = new Set<string>();
    return output.criteria.every((item) => {
      if (seen.has(item.criterionRef) || !criteria.some((c) => c.ref === item.criterionRef))
        return false;
      seen.add(item.criterionRef);
      if (!item.met) return item.quote === null;
      // Evidence is a whole-word span of at least two words (four CJK characters).
      return item.quote !== null && quotedIn(answer.text, item.quote, { words: 2, cjk: 4 });
    });
  },
};

export const skillExtractionOutput = z
  .object({
    facts: z
      .array(
        z
          .object({
            factRef: ref,
            skills: z
              .array(z.object({ skillRef: ref, quote: z.string().max(400) }).strict())
              .max(10),
          })
          .strict(),
      )
      .max(40),
  })
  .strict();
export type SkillExtractionOutput = z.infer<typeof skillExtractionOutput>;

/**
 * Each fact appears at most once, every skill comes from the provided list, and every assigned
 * skill quotes a non-trivial span of its own fact, so the model cannot credit unstated skills.
 */
export const skillExtractionSpec: OutputSpec<SkillExtractionOutput> = {
  schema: skillExtractionOutput,
  jsonSchema: {
    name: "skill_extraction",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["facts"],
      properties: {
        facts: {
          type: "array",
          maxItems: 40,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["factRef", "skills"],
            properties: {
              factRef: { type: "string" },
              skills: {
                type: "array",
                maxItems: 10,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["skillRef", "quote"],
                  properties: { skillRef: { type: "string" }, quote: { type: "string" } },
                },
              },
            },
          },
        },
      },
    },
  },
  references: (output) =>
    output.facts.flatMap((item) => [item.factRef, ...item.skills.map((skill) => skill.skillRef)]),
  verify: (output, request) => {
    const kinds = new Map(request.segments.map((segment) => [segment.ref, segment]));
    const seen = new Set<string>();
    return output.facts.every((item) => {
      const fact = kinds.get(item.factRef);
      if (seen.has(item.factRef) || fact?.label !== "fact") return false;
      seen.add(item.factRef);
      const skills = new Set<string>();
      return item.skills.every((skill) => {
        if (skills.has(skill.skillRef) || kinds.get(skill.skillRef)?.label !== "skill")
          return false;
        skills.add(skill.skillRef);
        // A skill name alone ("SQL", "檢索") can be its evidence, but only as a whole word.
        return quotedIn(fact.text, skill.quote, { words: 1, cjk: 2 });
      });
    });
  },
};
