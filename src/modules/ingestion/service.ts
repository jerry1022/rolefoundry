import { z } from "zod";
import type { Actor } from "../identity/core";
import { ApplicationError } from "../platform/errors";
import {
  importFormatSchema,
  ingestionText,
  ingestionLimits,
  importSourceSchema,
  ImportFailure,
} from "./model";
import type { ImportAuthorization, ImportSubmissionStore } from "./ports";
import { sanitizeImport } from "./input";
const uploadSchema = z
  .object({
    sourceId: z.uuid().transform((value) => value.toLowerCase()),
    batchId: ingestionText(120),
    format: importFormatSchema,
    content: z.string().min(1).max(ingestionLimits.bytes),
  })
  .strict();
export class ImportSubmissionService {
  constructor(
    private readonly store: ImportSubmissionStore,
    private readonly auth: ImportAuthorization,
  ) {}
  async submit(actor: Actor, input: unknown, key: unknown) {
    await this.auth.authorize(actor, "catalog:write");
    const parsed = uploadSchema.safeParse(input),
      requestKey = z.string().min(8).max(200).safeParse(key);
    if (!parsed.success || !requestKey.success)
      throw new ApplicationError(
        "RF_INVALID_INPUT",
        400,
        "Check the import source, batch identifier and file format.",
      );
    const sourceResult = importSourceSchema.safeParse(
      await this.store.source(parsed.data.sourceId),
    );
    if (!sourceResult.success || sourceResult.data.id !== parsed.data.sourceId)
      throw new ApplicationError(
        "RF_UNAVAILABLE",
        503,
        "The source configuration could not be verified.",
      );
    const source = sourceResult.data;
    try {
      const content = sanitizeImport(parsed.data.content, parsed.data.format, source);
      return await this.store.submit(
        {
          sourceId: source.id,
          batchId: parsed.data.batchId,
          sourceFingerprint: source.fingerprint,
          content,
        },
        requestKey.data,
      );
    } catch (error) {
      if (error instanceof ImportFailure)
        throw new ApplicationError(
          error.code === "too-large"
            ? "RF_TOO_LARGE"
            : error.code === "revoked-source"
              ? "RF_FORBIDDEN"
              : "RF_INVALID_INPUT",
          error.code === "too-large" ? 413 : error.code === "revoked-source" ? 403 : 400,
          "The import file is invalid, exceeds its limit or is not permitted by this source.",
        );
      throw error;
    }
  }
}
