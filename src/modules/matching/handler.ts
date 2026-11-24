import type { TaskHandler } from "../tasks/ports";
import { TaskFailure } from "../tasks/model";
import type { MatchingExecutionStore, SemanticRankingStore } from "./ports";
import { matchSnapshotSchema, matchResultSchema } from "./model";
import { rankMatches } from "./rules";
import type { SemanticRanker } from "./semantic";
import { z } from "zod";

/** Present only when the worker composes the semantic stage; otherwise rules-v1 runs as before. */
export interface SemanticStage {
  store: SemanticRankingStore;
  ranker: SemanticRanker;
}

export class MatchingHandler implements TaskHandler {
  constructor(
    private readonly store: MatchingExecutionStore,
    private readonly semantic?: SemanticStage,
  ) {}
  async execute(lease: Parameters<TaskHandler["execute"]>[0], signal: AbortSignal) {
    if (signal.aborted) throw new TaskFailure("canceled");
    const input = matchSnapshotSchema.safeParse(await this.store.load(lease, signal));
    if (!input.success) throw new TaskFailure("validation");
    const ranked = z.array(matchResultSchema).safeParse(rankMatches(input.data));
    if (!ranked.success) throw new TaskFailure("validation");
    if (signal.aborted) throw new TaskFailure("canceled");
    if (!this.semantic) return this.store.publish(lease, ranked.data, signal);

    const link = await this.semantic.store.semanticLink(lease, signal);
    let order;
    try {
      order = await this.semantic.ranker.order(input.data, ranked.data, link, signal);
    } catch {
      throw new TaskFailure(signal.aborted ? "canceled" : "infrastructure");
    }
    const results = z.array(matchResultSchema).safeParse(order.results);
    if (!results.success) throw new TaskFailure("validation");
    if (signal.aborted) throw new TaskFailure("canceled");
    const resultRef = await this.semantic.store.publishRanked(
      lease,
      results.data,
      order.ranking,
      signal,
    );
    // The report is committed; completing the identity task is bookkeeping and may be retried.
    await order.finalize(resultRef, signal).catch(() => undefined);
  }
}
