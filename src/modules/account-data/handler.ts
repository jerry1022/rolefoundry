import { TaskFailure } from "../tasks/model";
import type { TaskHandler } from "../tasks/ports";
import { exportPayloadSchema } from "./model";
import { ApplicationError } from "../platform/errors";
import type {
  AccountExportExecutionStore,
  AccountArchiveStorage,
  AccountArchiveBuilder,
  AccountExportCleanupStore,
} from "./ports";
export class AccountExportHandler implements TaskHandler {
  constructor(
    private readonly store: AccountExportExecutionStore,
    private readonly storage: AccountArchiveStorage,
    private readonly archive: AccountArchiveBuilder,
  ) {}
  async execute(lease: Parameters<TaskHandler["execute"]>[0], signal: AbortSignal) {
    try {
      signal.throwIfAborted();
      const parsed = exportPayloadSchema.safeParse(await this.store.load(lease));
      if (!parsed.success) throw new TaskFailure("validation");
      const payload = parsed.data;
      const output = await this.archive.build(
        payload,
        (key) => this.storage.source(key, signal),
        signal,
      );
      signal.throwIfAborted();
      const key = await this.store.prepare(lease);
      await this.storage.put(key, output.bytes, signal);
      signal.throwIfAborted();
      await this.store.publish(lease, key, output.sha256, output.bytes.byteLength);
    } catch (error) {
      if (error instanceof TaskFailure) throw error;
      if (error instanceof ApplicationError) {
        if ([401, 403, 404].includes(error.status)) throw new TaskFailure("forbidden");
        if (error.code === "RF_STALE_INPUT" || error.status === 409) throw new TaskFailure("stale");
        if (error.status === 400 || error.status === 413) throw new TaskFailure("validation");
      }
      throw error;
    }
  }
}
export class AccountExportJanitor {
  constructor(
    private readonly store: AccountExportCleanupStore,
    private readonly storage: AccountArchiveStorage,
  ) {}
  async tick(signal: AbortSignal) {
    signal.throwIfAborted();
    const due = await this.store.claim();
    if (!due.length) return 0;
    await this.storage.remove(
      due.map((row) => row.key),
      signal,
    );
    signal.throwIfAborted();
    const result = await Promise.allSettled(
      due.map((row) => this.store.acknowledge(row.id, row.token)),
    );
    return result.filter((item) => item.status === "fulfilled").length;
  }
}
