import {
  runOptionalAnalysis,
  type AnalysisLifecycle,
  type OptionalGateway,
} from "../gateway/analysis";
import type { GatewayRequest } from "../gateway/model";
import type { WordingOutput } from "../gateway/recipes";
import type { ResumeRevisionInput } from "./model";

/** Reservation and target-role text for one proposal (from the current lease). */
export interface WordingContext {
  identityTaskId: string;
  ownerId: string;
  inputVersion: string;
  jobTitle: string;
  requirements: string[];
}

/** Stored suggestion: one confirmed fact, reworded; applied only by the owner. */
export interface WordingSuggestion {
  factId: string;
  text: string;
  rationale: string;
}
export type WordingRecord =
  | { state: "not-requested"; code: null; suggestions: []; identityTaskId: null }
  | { state: "fallback"; code: string; suggestions: []; identityTaskId: string }
  | { state: "applied"; code: null; suggestions: WordingSuggestion[]; identityTaskId: string };

export interface WordingResult {
  wording: WordingRecord;
  finalize(resultRef: string, signal: AbortSignal): Promise<void>;
}

/** Contact details are never sent and never reworded; very short facts gain nothing. */
const eligible = (fact: ResumeRevisionInput["version"]["content"]["facts"][number]) =>
  fact.kind !== "contact" && fact.text.trim().length >= 12;
export const wordingBounds = { facts: 40, requirements: 12, requirementChars: 300 };

export function wordingRequest(
  input: ResumeRevisionInput,
  context: WordingContext,
): GatewayRequest {
  const facts = input.version.content.facts.filter(eligible).slice(0, wordingBounds.facts);
  const requirements = context.requirements
    .slice(0, wordingBounds.requirements)
    .map((text) => `- ${text.slice(0, wordingBounds.requirementChars)}`);
  return {
    taskId: context.identityTaskId,
    purpose: "resume.wording",
    ownerId: context.ownerId,
    inputVersion: context.inputVersion,
    templateVersion: "resume-wording-v1",
    locale: "en",
    instructions: [`Target role: ${context.jobTitle}`, "Relevant requirements:", ...requirements]
      .join("\n")
      .slice(0, 4000),
    segments: facts.map((fact) => ({ ref: fact.id, label: "fact", text: fact.text })),
    allowedRefs: facts.map((fact) => fact.id),
  };
}

const none = async () => {};

/** Optional AI wording suggestions; the deterministic order proposal never depends on them. */
export class WordingStage {
  constructor(
    private readonly lifecycle: AnalysisLifecycle,
    private readonly gateway: OptionalGateway<WordingOutput> | null,
  ) {}

  async suggest(
    input: ResumeRevisionInput,
    context: WordingContext | null,
    signal: AbortSignal,
  ): Promise<WordingResult> {
    const outcome = await runOptionalAnalysis(
      { lifecycle: this.lifecycle, gateway: this.gateway },
      context?.identityTaskId ?? null,
      {
        needed: input.version.content.facts.some(eligible),
        notNeededCode: "RF_WORDING_NOT_NEEDED",
        request: () => wordingRequest(input, context!),
      },
      signal,
    );
    if (outcome.kind === "not-requested")
      return {
        wording: { state: "not-requested", code: null, suggestions: [], identityTaskId: null },
        finalize: none,
      };
    if (outcome.kind === "fallback")
      return {
        wording: {
          state: "fallback",
          code: outcome.code,
          suggestions: [],
          identityTaskId: context!.identityTaskId,
        },
        finalize: none,
      };
    // Drop suggestions identical to the confirmed text; they add nothing to review.
    const current = new Map(input.version.content.facts.map((fact) => [fact.id, fact.text.trim()]));
    const suggestions = outcome.output.suggestions
      .filter((item) => item.text.trim() !== current.get(item.factRef))
      .map((item) => ({ factId: item.factRef, text: item.text, rationale: item.rationale }));
    return {
      wording: {
        state: "applied",
        code: null,
        suggestions,
        identityTaskId: context!.identityTaskId,
      },
      finalize: outcome.finalize,
    };
  }
}
