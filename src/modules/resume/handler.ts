import { z } from "zod";
import type { TaskHandler } from "../tasks/ports";
import { TaskFailure } from "../tasks/model";
import {
  resumeLimits,
  parseSourceSchema,
  extractedResumeSchema,
  ResumeProcessingError,
  revisionInputSchema,
  resumeVersionSchema,
} from "./model";
import type {
  ResumeParser,
  ResumeParseStore,
  ResumeRenderer,
  ResumeExportStore,
  ResumeReviser,
  ResumeRevisionStore,
} from "./ports";
import { validateResumeRevision, resumeText, resumeContentTokens, extractedText } from "./rules";
function check(signal: AbortSignal) {
  if (signal.aborted) throw new TaskFailure("canceled");
}
async function execute(signal: AbortSignal, work: () => Promise<void>) {
  check(signal);
  try {
    await work();
  } catch (error) {
    if (signal.aborted) throw new TaskFailure("canceled");
    if (error instanceof TaskFailure) throw error;
    if (error instanceof ResumeProcessingError)
      throw new TaskFailure(
        error.code === "parse-timeout"
          ? "timeout"
          : error.code === "process-failed"
            ? "infrastructure"
            : "validation",
      );
    if (error instanceof z.ZodError) throw new TaskFailure("validation");
    throw error;
  }
}
async function processing<T>(
  store: Pick<ResumeParseStore, "failed">,
  lease: Parameters<TaskHandler["execute"]>[0],
  signal: AbortSignal,
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ResumeProcessingError && !signal.aborted)
      await store.failed(lease, error.code, signal);
    throw error;
  }
}
export class ResumeParseHandler implements TaskHandler {
  constructor(
    private readonly store: ResumeParseStore,
    private readonly parser: ResumeParser,
  ) {}
  async execute(lease: Parameters<TaskHandler["execute"]>[0], signal: AbortSignal) {
    await execute(signal, async () => {
      const input = parseSourceSchema.parse(await this.store.load(lease, signal));
      check(signal);
      const draft = extractedResumeSchema.parse(
        await processing(this.store, lease, signal, async () =>
          input.sourceKind === "text"
            ? extractedText([{ text: input.text, page: null }], () => crypto.randomUUID())
            : await this.parser.parse(input.bytes, input.mediaType, signal),
        ),
      );
      check(signal);
      await this.store.publish(lease, draft, signal);
    });
  }
}
export class ResumeRevisionHandler implements TaskHandler {
  constructor(
    private readonly store: ResumeRevisionStore,
    private readonly reviser: ResumeReviser,
  ) {}
  async execute(lease: Parameters<TaskHandler["execute"]>[0], signal: AbortSignal) {
    await execute(signal, async () => {
      const input = revisionInputSchema.parse(await this.store.load(lease, signal));
      check(signal);
      const proposal = validateResumeRevision(input, await this.reviser.propose(input, signal));
      check(signal);
      await this.store.publish(lease, proposal, signal);
    });
  }
}
export class ResumeExportHandler implements TaskHandler {
  constructor(
    private readonly store: ResumeExportStore,
    private readonly renderer: ResumeRenderer,
    private readonly verifier: ResumeParser,
  ) {}
  async execute(lease: Parameters<TaskHandler["execute"]>[0], signal: AbortSignal) {
    await execute(signal, async () => {
      const version = resumeVersionSchema.parse(await this.store.load(lease, signal));
      check(signal);
      const bytes = await processing(this.store, lease, signal, () =>
        this.renderer.render(version.content, signal),
      );
      check(signal);
      if (
        bytes.length > resumeLimits.exportBytes ||
        String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-"
      )
        throw new TaskFailure("validation");
      const rendered = extractedResumeSchema.parse(
        await processing(this.store, lease, signal, () =>
          this.verifier.parse(bytes, "application/pdf", signal),
        ),
      );
      check(signal);
      if (
        JSON.stringify(resumeContentTokens(rendered.text)) !==
        JSON.stringify(resumeContentTokens(resumeText(version.content)))
      )
        throw new TaskFailure("validation");
      await this.store.publish(lease, bytes, signal);
    });
  }
}
