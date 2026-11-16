import { extractedText, resumeRenderSections } from "../rules";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  confirmedResumeSchema,
  processingCodes,
  resumeLimits,
  ResumeProcessingError,
  resumeMediaSchema,
} from "../model";
import type { ConfirmedResume, ResumeMedia } from "../model";
import type { ResumeParser, ResumeRenderer } from "../ports";
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const entry = fileURLToPath(
  new URL("../../../../apps/worker/src/resume/process.mjs", import.meta.url),
);
const responseSchema = z.union([
  z
    .object({
      ok: z.literal(true),
      pages: z
        .array(
          z
            .object({
              text: z.string().max(resumeLimits.textCharacters),
              page: z.number().int().positive().nullable(),
            })
            .strict(),
        )
        .min(1)
        .max(resumeLimits.sourcePages),
      documentWarnings: z.boolean(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(true),
      bytes: z.string().max(Math.ceil((resumeLimits.exportBytes * 4) / 3)),
    })
    .strict(),
  z.object({ ok: z.literal(false), code: z.enum(processingCodes) }).strict(),
]);
// The process boundary bounds parser crashes/time/memory, and Node permissions restrict JS IO.
// It is not an OS sandbox for malicious native code; run workers with container resource/egress policy.
export class IsolatedResumeProcessor implements ResumeParser, ResumeRenderer {
  constructor(private readonly timeoutMilliseconds = resumeLimits.processMilliseconds) {}
  private async execute(request: unknown, signal: AbortSignal) {
    signal.throwIfAborted();
    return await new Promise<z.infer<typeof responseSchema>>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--max-old-space-size=192",
          "--permission",
          "--allow-addons",
          `--allow-fs-read=${root}node_modules`,
          `--allow-fs-read=${root}apps/worker/src/resume`,
          `--allow-fs-read=${root}src/modules/resume/limits.json`,
          `--allow-fs-read=${root}assets/fonts`,
          `--allow-fs-read=${root}package.json`,
          entry,
        ],
        { cwd: root, env: { NODE_ENV: "production", TZ: "UTC" }, stdio: ["pipe", "pipe", "pipe"] },
      );
      let stdout = "",
        settled = false;
      const finish = (error?: unknown, value?: z.infer<typeof responseSchema>) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        child.kill("SIGKILL");
        error ? reject(error) : resolve(value!);
      };
      const abort = () => finish(signal.reason ?? new DOMException("Aborted", "AbortError"));
      const timer = setTimeout(
        () => finish(new ResumeProcessingError("parse-timeout")),
        this.timeoutMilliseconds,
      );
      signal.addEventListener("abort", abort, { once: true });
      child.once("error", () => finish(new ResumeProcessingError("process-failed")));
      child.stdin.on("error", () => {});
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
        if (stdout.length > Math.ceil((resumeLimits.exportBytes * 4) / 3) + 10000)
          finish(new ResumeProcessingError("too-large"));
      });
      child.stderr.on("data", () => {}); // Never retain library diagnostics or source content.
      child.once("close", (code) => {
        if (settled) return;
        try {
          const result = responseSchema.parse(JSON.parse(stdout));
          if (!result.ok) finish(new ResumeProcessingError(result.code));
          else if (code !== 0) finish(new ResumeProcessingError("process-failed"));
          else finish(undefined, result);
        } catch {
          finish(new ResumeProcessingError("process-failed"));
        }
      });
      child.stdin.end(JSON.stringify(request));
      if (signal.aborted) abort();
    });
  }
  async parse(bytes: Uint8Array, mediaType: ResumeMedia, signal: AbortSignal) {
    if (bytes.length > resumeLimits.sourceBytes) throw new ResumeProcessingError("too-large");
    if (!resumeMediaSchema.safeParse(mediaType).success)
      throw new ResumeProcessingError("unsupported-file");
    const response = await this.execute(
      { operation: "parse", mediaType, bytes: Buffer.from(bytes).toString("base64") },
      signal,
    );
    if (!response.ok || !("pages" in response)) throw new ResumeProcessingError("invalid-output");
    const result = extractedText(response.pages, randomUUID);
    if (response.documentWarnings) result.warnings.push("document-warnings");
    return result;
  }
  async render(content: ConfirmedResume, signal: AbortSignal) {
    const response = await this.execute(
      { operation: "render", sections: resumeRenderSections(confirmedResumeSchema.parse(content)) },
      signal,
    );
    if (!response.ok || !("bytes" in response)) throw new ResumeProcessingError("invalid-output");
    const bytes = Buffer.from(response.bytes, "base64");
    if (bytes.length > resumeLimits.exportBytes || bytes.subarray(0, 5).toString() !== "%PDF-")
      throw new ResumeProcessingError("invalid-output");
    return bytes;
  }
}
