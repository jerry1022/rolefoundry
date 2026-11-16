import type { PrivateResumeStorage, ResumeCleanupRepository } from "./ports";
/** Owner deletion cannot disable this service-only, reference-only cleanup authority. */
export class ResumeStorageJanitor {
  constructor(
    private readonly repository: ResumeCleanupRepository,
    private readonly storage: PrivateResumeStorage,
  ) {}
  async tick(signal: AbortSignal) {
    signal.throwIfAborted();
    const due = await this.repository.claim(signal);
    if (!due.length) return 0;
    await this.storage.remove(
      due.map((item) => item.key),
      signal,
    );
    signal.throwIfAborted();
    const outcomes = await Promise.allSettled(
      due.map((item) => this.repository.acknowledge(item.id, item.token, signal)),
    );
    return outcomes.filter((outcome) => outcome.status === "fulfilled").length;
  }
}
