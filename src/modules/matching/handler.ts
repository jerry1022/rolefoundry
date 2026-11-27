import type { TaskHandler } from "../tasks/ports";
import { TaskFailure } from "../tasks/model";
import type { MatchingExecutionStore } from "./ports";
import { matchSnapshotSchema, matchResultSchema } from "./model";
import { rankMatches } from "./rules";
import { z } from "zod";
export class MatchingHandler implements TaskHandler {
  constructor(private readonly store: MatchingExecutionStore) {}
  async execute(lease: Parameters<TaskHandler["execute"]>[0], signal: AbortSignal) {
    if (signal.aborted) throw new TaskFailure("canceled");
    const input = matchSnapshotSchema.safeParse(await this.store.load(lease, signal));
    if (!input.success) throw new TaskFailure("validation");
    const output = z.array(matchResultSchema).safeParse(rankMatches(input.data));
    if (!output.success) throw new TaskFailure("validation");
    if (signal.aborted) throw new TaskFailure("canceled");
    await this.store.publish(lease, output.data, signal);
  }
}
