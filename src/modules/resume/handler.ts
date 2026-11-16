import { z } from "zod";
import type { TaskHandler } from "../tasks/ports";
import { TaskFailure } from "../tasks/model";
import {
  resumeLimits,
  resumeMediaSchema,
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
import { validateResumeRevision, resumeText, resumeContentTokens } from "./rules";
const parseInput = z
  .object({
    mediaType: resumeMediaSchema,
    byteCount: z.number().int().positive().max(resumeLimits.sourceBytes),
    bytes: z.instanceof(Uint8Array),
  })
  .strict()
  .refine((value) => value.bytes.length === value.byteCount);
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
export class ResumeParseHandler implements TaskHandler {
  constructor(
    private readonly store: ResumeParseStore,
    private readonly parser: ResumeParser,
  ) {}
  async execute(lease: Parameters<TaskHandler["execute"]>[0], signal: AbortSignal) {
    await execute(signal, async () => {
      const input = parseInput.parse(await this.store.load(lease, signal));
      check(signal);
      const draft = extractedResumeSchema.parse(
        await this.parser.parse(input.bytes, input.mediaType, signal),
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
      const bytes = await this.renderer.render(version.content, signal);
      check(signal);
      if (
        bytes.length > resumeLimits.exportBytes ||
        String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-"
      )
        throw new TaskFailure("validation");
      const rendered = extractedResumeSchema.parse(
        await this.verifier.parse(bytes, "application/pdf", signal),
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
