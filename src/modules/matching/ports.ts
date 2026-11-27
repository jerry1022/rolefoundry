import type { Actor } from "../identity/core";
import type { TaskLease } from "../tasks/model";
import type {
  MatchSnapshot,
  MatchResult,
  MatchRun,
  MatchTask,
  MatchHistory,
  RefreshMatchInput,
} from "./model";
import type { RankingRecord, SemanticLink } from "./semantic";
export interface MatchingRepository {
  refresh(input: RefreshMatchInput, idempotencyKey: string): Promise<MatchTask>;
  find(id: string, cursor?: string): Promise<MatchRun>;
  list(cursor?: string): Promise<MatchHistory>;
}
export interface MatchingAuthorization {
  authorize(actor: Actor, action: string, ownerId?: string): Promise<void>;
}
export interface MatchingExecutionStore {
  load(lease: TaskLease, signal: AbortSignal): Promise<MatchSnapshot>;
  publish(lease: TaskLease, results: MatchResult[], signal: AbortSignal): Promise<void>;
}
/** Optional semantic stage: the run's identity reservation and ranked, atomic publication. */
export interface SemanticRankingStore {
  semanticLink(lease: TaskLease, signal: AbortSignal): Promise<SemanticLink | null>;
  publishRanked(
    lease: TaskLease,
    results: MatchResult[],
    ranking: RankingRecord,
    signal: AbortSignal,
  ): Promise<string>;
}
export interface MatchingClient extends MatchingRepository {}
