import type { TaskHandler } from "../tasks/ports";
import { TaskFailure } from "../tasks/model";
import { ApplicationError } from "../platform/errors";
import { deletionSubjectSchema, deletionFileSchema } from "./model";
import { z } from "zod";
import type {
  DeletionDirectory,
  DeletionFiles,
  DeletionExecutionStore,
  LateDeletionStore,
} from "./ports";
export class AccountDeletionHandler implements TaskHandler {
  constructor(
    private readonly store: DeletionExecutionStore,
    private readonly directory: DeletionDirectory,
    private readonly storage: DeletionFiles,
  ) {}
  async execute(lease: Parameters<TaskHandler["execute"]>[0], signal: AbortSignal) {
    try {
      signal.throwIfAborted();
      const subject = deletionSubjectSchema.parse(await this.store.load(lease));
      await this.directory.block(subject.subjectId, signal);
      signal.throwIfAborted();
      const files = z
        .array(deletionFileSchema)
        .max(50)
        .parse(await this.store.files(lease));
      await this.storage.remove(subject.subjectId, files, signal);
      signal.throwIfAborted();
      if (!(await this.store.beginAuth(lease))) {
        await this.store.defer(lease, 10);
        return "deferred" as const;
      }
      signal.throwIfAborted();
      await this.directory.remove(subject.subjectId, signal);
      signal.throwIfAborted();
      await this.store.finish(lease);
    } catch (error) {
      if (error instanceof ApplicationError) {
        if (error.status === 400) throw new TaskFailure("validation");
        if (error.code === "RF_CONFLICT" || error.code === "RF_STALE_INPUT")
          throw new TaskFailure("stale");
        if ([401, 403, 404].includes(error.status)) throw new TaskFailure("forbidden");
      }
      if (error instanceof z.ZodError) throw new TaskFailure("validation");
      throw error;
    }
  }
}

/** Reclaims an unexpected late write without reactivating an erased account. */
export class LateDeletionJanitor {
  constructor(
    private readonly store: LateDeletionStore,
    private readonly files: DeletionFiles,
  ) {}
  async tick(signal: AbortSignal) {
    signal.throwIfAborted();
    const pending = await this.store.pending();
    let count = 0;
    for (const item of pending) {
      await this.files.remove(item.subjectId, item.files, signal);
      count += item.files.length;
    }
    return count;
  }
}
