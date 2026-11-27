import type { TaskHandler } from "../tasks/ports";
import { TaskFailure } from "../tasks/model";
import type { LearningExecutionStore, LearningGapAnalyzer } from "./ports";
import { learningSnapshotSchema, learningOutputSchema } from "./model";
import { planLearning } from "./planner";
export class LearningHandler implements TaskHandler {
  constructor(
    private readonly store: LearningExecutionStore,
    private readonly gaps: LearningGapAnalyzer,
  ) {}
  async execute(lease: Parameters<TaskHandler["execute"]>[0], signal: AbortSignal) {
    if (signal.aborted) throw new TaskFailure("canceled");
    const input = learningSnapshotSchema.safeParse(await this.store.load(lease, signal));
    if (!input.success) throw new TaskFailure("validation");
    const output = learningOutputSchema.safeParse(
      planLearning(input.data, await this.gaps.analyze(input.data.matching, signal)),
    );
    if (!output.success) throw new TaskFailure("validation");
    if (signal.aborted) throw new TaskFailure("canceled");
    await this.store.publish(lease, output.data, signal);
  }
}
