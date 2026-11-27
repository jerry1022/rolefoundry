import { runOptionalAnalysis, type AnalysisLifecycle } from "../gateway/analysis";
import type { GatewayRequest, GatewayResult } from "../gateway/model";

export type { AnalysisLifecycle };
import type { RankOutput } from "../gateway/recipes";
import type { MatchResult, MatchSnapshot } from "./model";
import {
  applySemanticTiebreak,
  rulesOnlyLimitation,
  semanticOrderLimitation,
  structuralOrder,
} from "./rules";

/** Identity reservation found for this run (created before the run, keyed by its request). */
export interface SemanticLink {
  identityTaskId: string;
  ownerId: string;
  inputVersion: string;
}

export type RankingRecord =
  | { recipe: "rules-v1"; state: "not-requested"; code: null; identityTaskId: null }
  | { recipe: "rules-v1"; state: "fallback"; code: string; identityTaskId: string | null }
  | { recipe: "rules-v1+semantic-rank-v1"; state: "applied"; code: null; identityTaskId: string };

/** Narrow view of the AI gateway: the deployment may leave the purpose disabled. */
export interface SemanticGateway {
  rank(request: GatewayRequest, signal: AbortSignal): Promise<GatewayResult<RankOutput>>;
  record(result: GatewayResult<RankOutput>, signal: AbortSignal): Promise<void>;
}

export interface SemanticOrder {
  results: MatchResult[];
  ranking: RankingRecord;
  /** Completes the identity task after the report is durably published. */
  finalize(resultRef: string, signal: AbortSignal): Promise<void>;
}

/** Bounds keep the request within the gateway's segment limit and a reviewable prompt size. */
export const semanticBounds = { jobs: 24, evidence: 36, jobChars: 1200, evidenceChars: 600 };

const notRequested: RankingRecord = {
  recipe: "rules-v1",
  state: "not-requested",
  code: null,
  identityTaskId: null,
};
const nothing = async () => {};

/** Jobs that the structured rules cannot order (ties of two or more), in rules order. */
export function tiedJobs(ranked: readonly MatchResult[]) {
  const tied: MatchResult[] = [];
  for (let start = 0; start < ranked.length;) {
    let end = start + 1;
    while (end < ranked.length && structuralOrder(ranked[start], ranked[end]) === 0) end++;
    if (end - start > 1) tied.push(...ranked.slice(start, end));
    start = end;
  }
  return tied;
}

export function semanticRequest(
  snapshot: MatchSnapshot,
  tied: readonly MatchResult[],
  link: SemanticLink,
): GatewayRequest {
  const clip = (text: string, max: number) => (text.length > max ? text.slice(0, max) : text);
  const jobs = tied.slice(0, semanticBounds.jobs).map((result) => {
    const job = snapshot.jobs.find((item) => item.id === result.jobId)!;
    const requirements = job.requirements.map((item) => `- (${item.priority}) ${item.text}`);
    return {
      ref: job.id,
      label: "job",
      text: clip(
        [`${job.title} at ${job.company}`, ...requirements].join("\n"),
        semanticBounds.jobChars,
      ),
    };
  });
  // Only positive support can justify a score; practice gaps and learning goals are excluded.
  const evidence = snapshot.evidence
    .filter((item) => ["support", "claim", "reference"].includes(item.signal))
    .slice(0, semanticBounds.evidence)
    .map((item) => ({
      ref: item.versionId,
      label: "evidence",
      text: clip(`${item.label}: ${item.context}`, semanticBounds.evidenceChars),
    }));
  const segments = [...jobs, ...evidence];
  return {
    taskId: link.identityTaskId,
    purpose: "matching.semantic-rank",
    ownerId: link.ownerId,
    inputVersion: link.inputVersion,
    templateVersion: "semantic-rank-v1",
    locale: "en",
    instructions:
      "Score each job from 0 to 1 by how well the evidence supports its stated requirements. Cite the supporting evidence refs.",
    segments,
    allowedRefs: segments.map((segment) => segment.ref),
  };
}

const withLimitation = (results: MatchResult[]) =>
  results.map((result) => ({
    ...result,
    limitations: result.limitations.map((text) =>
      text === rulesOnlyLimitation ? semanticOrderLimitation : text,
    ),
  }));

/**
 * Optional semantic tie-breaking. Any unavailable, invalid or revoked step falls back to the
 * unchanged rules order and records why; structured strengths/gaps are never altered.
 */
export class SemanticRanker {
  constructor(
    private readonly lifecycle: AnalysisLifecycle,
    private readonly gateway: SemanticGateway | null,
  ) {}

  async order(
    snapshot: MatchSnapshot,
    ranked: MatchResult[],
    link: SemanticLink | null,
    signal: AbortSignal,
  ): Promise<SemanticOrder> {
    const tied = tiedJobs(ranked);
    const outcome = await runOptionalAnalysis(
      {
        lifecycle: this.lifecycle,
        gateway: this.gateway && {
          run: (request, runSignal) => this.gateway!.rank(request, runSignal),
          record: (result, recordSignal) => this.gateway!.record(result, recordSignal),
        },
      },
      link?.identityTaskId ?? null,
      {
        needed: tied.length >= 2,
        notNeededCode: "RF_SEMANTIC_NOT_NEEDED",
        request: () => semanticRequest(snapshot, tied, link!),
      },
      signal,
    );
    if (outcome.kind === "not-requested")
      return { results: ranked, ranking: notRequested, finalize: nothing };
    if (outcome.kind === "fallback")
      return {
        results: ranked,
        ranking: {
          recipe: "rules-v1",
          state: "fallback",
          code: outcome.code,
          identityTaskId: link!.identityTaskId,
        },
        finalize: nothing,
      };
    const scores = new Map(outcome.output.ranking.map((item) => [item.jobRef, item.score]));
    return {
      results: withLimitation(applySemanticTiebreak(ranked, scores)),
      ranking: {
        recipe: "rules-v1+semantic-rank-v1",
        state: "applied",
        code: null,
        identityTaskId: link!.identityTaskId,
      },
      finalize: outcome.finalize,
    };
  }
}
