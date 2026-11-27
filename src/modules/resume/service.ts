import { z } from "zod";
import type { Actor } from "../identity/core";
import { ApplicationError } from "../platform/errors";
import {
  reserveOptionalAnalysis,
  withOptionalAnalysis,
  type AnalysisReservations,
} from "../gateway/analysis";
import type {
  ResumeRepository,
  PrivateResumeStorage,
  ResumeDigest,
  ResumeAuthorization,
} from "./ports";
import {
  uploadIntentSchema,
  resumeMediaSchema,
  resumeLimits,
  confirmedResumeSchema,
} from "./model";
const uuid = z.uuid().transform((value) => value.toLowerCase()),
  revision = z.number().int().positive(),
  keySchema = z.string().min(8).max(200);
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApplicationError("RF_INVALID_INPUT", 400, "Check the resume fields and versions.");
  return result.data;
}
export class ResumeService {
  constructor(
    private readonly repository: ResumeRepository,
    private readonly storage: PrivateResumeStorage,
    private readonly digest: ResumeDigest,
    private readonly auth: ResumeAuthorization,
    private readonly reservations?: AnalysisReservations,
  ) {}
  private allow(actor: Actor, write = false) {
    return this.auth.authorize(actor, write ? "resume:write" : "resume:read", actor.userId);
  }
  async list(actor: Actor, cursor?: unknown) {
    await this.allow(actor);
    return this.repository.list(
      cursor === undefined ? undefined : parse(z.string().min(1).max(256), cursor),
    );
  }
  async find(actor: Actor, id: unknown) {
    await this.allow(actor);
    return this.repository.find(parse(uuid, id));
  }
  async version(actor: Actor, id: unknown) {
    await this.allow(actor);
    return this.repository.version(parse(uuid, id));
  }
  async intent(actor: Actor, input: unknown, key: unknown) {
    await this.allow(actor, true);
    return this.repository.intent(parse(uploadIntentSchema, input), parse(keySchema, key));
  }
  async upload(
    actor: Actor,
    id: unknown,
    token: unknown,
    media: unknown,
    bytes: Uint8Array,
    signal: AbortSignal,
  ) {
    await this.allow(actor, true);
    signal.throwIfAborted();
    const documentId = parse(uuid, id),
      authority = parse(uuid, token),
      mediaType = parse(resumeMediaSchema, media);
    if (!bytes.length || bytes.length > resumeLimits.sourceBytes)
      throw new ApplicationError(
        "RF_INVALID_INPUT",
        400,
        "The resume file must be between 1 byte and 5 MiB.",
      );
    const hash = this.digest.sha256(bytes),
      intent = await this.repository.beginUpload(documentId, authority, hash, bytes.length);
    if (intent.mediaType !== mediaType)
      throw new ApplicationError(
        "RF_INVALID_INPUT",
        400,
        "The file type differs from its upload intent.",
      );
    if (!intent.alreadyUploaded) {
      // An uncertain write/duplicate is resolved by reading and verifying the registered object.
      try {
        await this.storage.put(intent.key, bytes, mediaType, signal);
      } catch {
        signal.throwIfAborted();
      }
      const actual = await this.storage.get(intent.key, signal);
      signal.throwIfAborted();
      if (actual.length !== bytes.length || this.digest.sha256(actual) !== hash)
        throw new ApplicationError(
          "RF_CONFLICT",
          409,
          "Stored file verification failed. Create a fresh upload intent.",
        );
      if (!intent.claim)
        throw new ApplicationError("RF_CONFLICT", 409, "The upload authority has expired.");
      await this.repository.finishUpload(documentId, intent.claim, hash, bytes.length);
    }
    return this.repository.find(documentId);
  }
  async paste(actor: Actor, input: unknown, key: unknown) {
    await this.allow(actor, true);
    const value = parse(
      z.object({ text: z.string().min(1).max(resumeLimits.textCharacters) }).strict(),
      input,
    );
    return this.repository.paste(value.text, parse(keySchema, key));
  }
  async retryParse(actor: Actor, id: unknown, input: unknown, key: unknown) {
    await this.allow(actor, true);
    const value = parse(z.object({ previousTaskId: uuid }).strict(), input);
    return this.repository.retryParse(parse(uuid, id), value.previousTaskId, parse(keySchema, key));
  }
  async confirm(actor: Actor, id: unknown, input: unknown) {
    await this.allow(actor, true);
    const value = parse(
      z.object({ expectedRevision: revision, content: confirmedResumeSchema }).strict(),
      input,
    );
    return this.repository.confirm(parse(uuid, id), value.expectedRevision, value.content);
  }
  async revise(actor: Actor, id: unknown, input: unknown, key: unknown) {
    await this.allow(actor, true);
    const value = parse(
      z
        .object({
          versionId: uuid,
          jobId: uuid,
          expectedRevision: revision,
          /** Opt-in AI wording suggestions; needs `resume` consent and weekly allowance. */
          wording: z.boolean().optional(),
        })
        .strict(),
      input,
    );
    const requestKey = parse(keySchema, key);
    // Reserve before the proposal exists so its worker can never start without it.
    const analysis = value.wording
      ? await reserveOptionalAnalysis(this.reservations, actor, {
          feature: "resume",
          prefix: "resume-wording",
          requestKey,
        })
      : ({ state: "not-requested", code: null, taskId: null } as const);
    const { analysis: wording, ...task } = await withOptionalAnalysis(
      this.reservations,
      analysis,
      () =>
        this.repository.revise(
          parse(uuid, id),
          value.versionId,
          value.jobId,
          value.expectedRevision,
          requestKey,
        ),
    );
    return { ...task, wording };
  }
  async proposal(actor: Actor, id: unknown) {
    await this.allow(actor);
    return this.repository.proposal(parse(uuid, id));
  }
  async accept(actor: Actor, id: unknown, input: unknown) {
    await this.allow(actor, true);
    const value = parse(
      z
        .object({
          expectedRevision: revision,
          changeIds: z
            .array(uuid)
            .max(resumeLimits.sections)
            .refine((ids) => new Set(ids).size === ids.length),
        })
        .strict(),
      input,
    );
    return this.repository.accept(parse(uuid, id), value.expectedRevision, value.changeIds);
  }
  async export(actor: Actor, id: unknown, input: unknown, key: unknown) {
    await this.allow(actor, true);
    const value = parse(z.object({ versionId: uuid }).strict(), input);
    return this.repository.export(parse(uuid, id), value.versionId, parse(keySchema, key));
  }
  async downloadIntent(actor: Actor, id: unknown) {
    await this.allow(actor);
    return this.repository.downloadIntent(parse(uuid, id));
  }
  async download(actor: Actor, id: unknown, signal: AbortSignal) {
    await this.allow(actor);
    const authority = parse(uuid, id),
      manifest = await this.repository.downloadAccess(authority),
      bytes = await this.storage.get(manifest.key, signal);
    signal.throwIfAborted();
    if (bytes.length !== manifest.byteCount || this.digest.sha256(bytes) !== manifest.sha256)
      throw new ApplicationError("RF_UNAVAILABLE", 503, "The fixed export could not be verified.");
    const current = await this.repository.downloadAccess(authority);
    if (current.key !== manifest.key || current.sha256 !== manifest.sha256)
      throw new ApplicationError("RF_NOT_FOUND", 404, "The download is unavailable.");
    return { bytes, filename: `resume-${manifest.versionId}.pdf` };
  }
  async remove(actor: Actor, id: unknown, input: unknown) {
    await this.allow(actor, true);
    const value = parse(z.object({ expectedRevision: revision }).strict(), input);
    return this.repository.remove(parse(uuid, id), value.expectedRevision);
  }
}
