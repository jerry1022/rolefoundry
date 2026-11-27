import { TaskFailure } from "../tasks/model";
import type { TaskHandler } from "../tasks/ports";
import { FeedFailure, ImportFailure, importSourceSchema } from "./model";
import { sanitizeImport } from "./input";
import type {
  FeedExecutionStore,
  FeedReader,
  FeedRegistry,
  FeedScheduleStore,
  ImportDigest,
} from "./ports";
/** Retrieval seals a batch once; catalog.import owns normalization and human review. */
export class FeedImportHandler implements TaskHandler {
  constructor(
    private readonly store: FeedExecutionStore,
    private readonly registry: FeedRegistry,
    private readonly reader: FeedReader,
    private readonly digest: ImportDigest,
  ) {}
  async execute(lease: Parameters<TaskHandler["execute"]>[0], signal: AbortSignal) {
    if (signal.aborted) throw new TaskFailure("canceled");
    if (lease.kind !== "catalog.fetch") throw new TaskFailure("validation");
    const input = await this.store.load(lease, signal),
      parsed = importSourceSchema.safeParse(input.source);
    if (!parsed.success || parsed.data.status !== "active") throw new TaskFailure("forbidden");
    if (input.waitSeconds > 0) throw new TaskFailure("infrastructure", input.waitSeconds);
    const feed = this.registry.find(input.feedId, parsed.data.kind);
    if (!feed || feed.revision !== input.feedRevision) throw new TaskFailure("stale");
    try {
      const text = await this.reader.read(feed, signal);
      if (signal.aborted) throw new TaskFailure("canceled");
      const content = sanitizeImport(text, feed.format, parsed.data);
      await this.store.prepare(lease, content, this.digest.sha256(text), signal);
    } catch (error) {
      if (signal.aborted) throw new TaskFailure("canceled");
      if (error instanceof FeedFailure) {
        await this.store.failure(
          lease,
          error.code,
          error.retryAfterSeconds === undefined ? null : String(error.retryAfterSeconds),
          error.requiresManualRetry,
          signal,
        );
        throw new TaskFailure(
          error.requiresManualRetry ||
            ["blocked", "redirect", "too-large", "media-type"].includes(error.code)
            ? "validation"
            : error.code === "timeout"
              ? "timeout"
              : "infrastructure",
          error.requiresManualRetry ? undefined : error.retryAfterSeconds,
        );
      }
      if (error instanceof ImportFailure) {
        await this.store.failure(lease, "invalid-content", null, false, signal);
        throw new TaskFailure("validation");
      }
      throw error;
    }
  }
}
export class FeedScheduler {
  constructor(
    private readonly store: FeedScheduleStore,
    private readonly registry: FeedRegistry,
  ) {}
  async tick(signal: AbortSignal) {
    if (signal.aborted) return 0;
    return this.store.due(
      this.registry
        .list()
        .map(({ id, kind, format, revision }) => ({ id, kind, format, revision })),
      signal,
    );
  }
}
