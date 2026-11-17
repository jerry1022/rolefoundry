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
import type {
  ImportAuthorization,
  ImportSubmissionStore,
  ImportDigest,
  ImportAdministrationStore,
} from "./ports";
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
    private readonly digest: ImportDigest,
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
          rawHash: this.digest.sha256(parsed.data.content),
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
export class ImportAdministrationService {
  constructor(
    private readonly store: ImportAdministrationStore,
    private readonly auth: ImportAuthorization,
  ) {}
  private parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const result = schema.safeParse(value);
    if (!result.success)
      throw new ApplicationError(
        "RF_INVALID_INPUT",
        400,
        "Check the import settings or resource identifier.",
      );
    return result.data;
  }
  async settings(actor: Actor) {
    await this.auth.authorize(actor, "catalog:write");
    return this.store.settings();
  }
  async configure(actor: Actor, id: unknown, input: unknown) {
    await this.auth.authorize(actor, "catalog:write");
    const value = this.parse(
      z
        .object({
          expectedRevision: z.number().int().nonnegative(),
          uploadsEnabled: z.boolean(),
          allowClosure: z.boolean(),
        })
        .strict(),
      input,
    );
    return this.store.configure(
      this.parse(z.uuid(), id),
      value.expectedRevision,
      value.uploadsEnabled,
      value.allowClosure,
    );
  }
  async find(actor: Actor, id: unknown) {
    await this.auth.authorize(actor, "catalog:write");
    return this.store.find(this.parse(z.uuid(), id));
  }
  async list(actor: Actor, cursor?: unknown) {
    await this.auth.authorize(actor, "catalog:write");
    return this.store.list(
      cursor === undefined ? undefined : this.parse(z.string().min(1).max(256), cursor),
    );
  }
}
