import { TaskFailure } from "../tasks/model";
import type { TaskHandler } from "../tasks/ports";
import type { ImportExecutionStore } from "./ports";
import { ImportFailure, importContextSchema, sanitizedImportSchema } from "./model";
import { planImport, type ImportKeyFactory } from "./normalizer";
export class ImportHandler implements TaskHandler {
  constructor(
    private readonly store: ImportExecutionStore,
    private readonly keys: ImportKeyFactory,
  ) {}
  async execute(lease: Parameters<TaskHandler["execute"]>[0], signal: AbortSignal) {
    if (signal.aborted) throw new TaskFailure("canceled");
    if (lease.kind !== "catalog.import") throw new TaskFailure("validation");
    const raw = await this.store.load(lease, signal),
      content = sanitizedImportSchema.safeParse(raw.content),
      context = importContextSchema.safeParse(raw.context);
    if (!content.success || !context.success) throw new TaskFailure("validation");
    let output;
    try {
      output = planImport(content.data, context.data, this.keys);
    } catch (error) {
      throw new TaskFailure(
        error instanceof ImportFailure && error.code === "revoked-source"
          ? "forbidden"
          : "validation",
      );
    }
    if (signal.aborted) throw new TaskFailure("canceled");
    await this.store.publish(lease, output, signal);
  }
}
