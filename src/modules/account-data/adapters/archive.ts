import "server-only";
import { createHash } from "node:crypto";
import type { Readable } from "node:stream";
import { ZipFile } from "yazl";
import { accountExportLimits, type ExportPayload } from "../model";
import type { AccountArchiveBuilder } from "../ports";
import { TaskFailure } from "../../tasks/model";
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export class ZipAccountArchive implements AccountArchiveBuilder {
  verify(bytes: Uint8Array, sha256: string) {
    return hash(bytes) === sha256;
  }
  async build(
    payload: ExportPayload,
    source: (key: string) => Promise<Uint8Array>,
    signal: AbortSignal,
  ) {
    const zip = new ZipFile(),
      output = zip.outputStream as Readable,
      chunks: Buffer[] = [];
    let size = 0,
      rawBytes = 0;
    const collected = new Promise<Buffer>((resolve, reject) => {
      output.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > accountExportLimits.archiveBytes) output.destroy(new TaskFailure("validation"));
        else chunks.push(chunk);
      });
      output.once("error", reject);
      output.once("end", () => resolve(Buffer.concat(chunks)));
      zip.on("error", reject);
    });
    // Install a rejection handler while asynchronous source reads are still in progress.
    void collected.catch(() => {});
    const abort = () => output.destroy(new TaskFailure("canceled"));
    signal.addEventListener("abort", abort, { once: true });
    try {
      signal.throwIfAborted();
      if (payload.files.length > accountExportLimits.files) throw new TaskFailure("validation");
      const manifest = {
        ...payload,
        files: payload.files.map(({ path, sha256, byteCount }) => ({ path, sha256, byteCount })),
      };
      const json = Buffer.from(JSON.stringify(manifest, null, 2));
      if (json.length > accountExportLimits.jsonBytes) throw new TaskFailure("validation");
      zip.addBuffer(json, "account.json");
      const paths = new Set<string>();
      for (const file of payload.files) {
        signal.throwIfAborted();
        if (!file.key.startsWith(payload.account.id + "/") || paths.has(file.path))
          throw new TaskFailure("validation");
        paths.add(file.path);
        rawBytes += file.byteCount;
        if (rawBytes > accountExportLimits.fileBytes) throw new TaskFailure("validation");
        const bytes = await source(file.key);
        signal.throwIfAborted();
        if (bytes.length !== file.byteCount || hash(bytes) !== file.sha256)
          throw new TaskFailure("validation");
        zip.addBuffer(Buffer.from(bytes), file.path, { compress: false });
      }
      zip.end();
      const bytes = await collected;
      signal.throwIfAborted();
      return { bytes, sha256: hash(bytes) };
    } catch (error) {
      output.destroy();
      throw error;
    } finally {
      signal.removeEventListener("abort", abort);
    }
  }
}
