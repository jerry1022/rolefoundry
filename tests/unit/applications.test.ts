import { describe, it, expect } from "vitest";
import type { Actor } from "../../src/modules/identity/core";
import { ApplicationService } from "../../src/modules/applications/service";
import type { ApplicationRepository } from "../../src/modules/applications/ports";
import {
  applicationSchema,
  editSchema,
  followUpSchema,
} from "../../src/modules/applications/model";
import {
  mergeApplication,
  mergeApplications,
  localDateInput,
  localInputToUtc,
} from "../../src/modules/applications/record-state";
const id = () => crypto.randomUUID();
const actor = { userId: id(), role: "member" } as Actor;
function record(revision = 1) {
  return applicationSchema.parse({
    id: id(),
    ownerId: actor.userId,
    revision,
    cycle: 1,
    jobId: id(),
    jobVersionId: id(),
    title: "Authored role",
    company: "Fixture",
    sources: [],
    available: true,
    stage: "Saved",
    note: "Original note",
    confirmationReference: null,
    resume: null,
    followUps: [],
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
  });
}
describe("application use cases and portable state", () => {
  it("authorizes before any replaceable persistence call", async () => {
    let calls = 0;
    const repo = {
      track: async () => {
        calls++;
        return record();
      },
    } as unknown as ApplicationRepository;
    const service = new ApplicationService(repo, {
      authorize: async () => {
        throw Error("Denied");
      },
    });
    await expect(service.track(actor, { jobId: id() }, "request-key")).rejects.toThrow("Denied");
    expect(calls).toBe(0);
  });
  it("passes exact source/revision/key through an injected contract without inventing stages", async () => {
    const saved = record();
    let received: unknown;
    const actions: string[] = [];
    const repo = {
      track: async (input: unknown, key: string) => {
        received = { input, key };
        return saved;
      },
    } as unknown as ApplicationRepository;
    const service = new ApplicationService(repo, {
        authorize: async (_actor, action) => {
          actions.push(action);
        },
      }),
      jobId = id();
    expect(await service.track(actor, { jobId }, "authored-request")).toEqual(saved);
    expect(received).toEqual({ input: { jobId }, key: "authored-request" });
    expect(actions).toEqual(["applications:write"]);
    await expect(
      service.track(actor, { jobId, stage: "Applied" }, "authored-request"),
    ).rejects.toMatchObject({ code: "RF_INVALID_INPUT" });
  });
  it("validates complete optimistic edits and bounded Unicode private fields", () => {
    const base = {
      expectedRevision: 1,
      stage: "Applied",
      note: "😀".repeat(2000),
      resumeVersionId: null,
      confirmationReference: null,
    };
    expect(editSchema.safeParse(base).success).toBe(true);
    for (const changes of [
      { userId: actor.userId },
      { expectedRevision: 0 },
      { expectedRevision: 1.5 },
      { note: "😀".repeat(2001) },
      { note: "unsafe\u0000text" },
      { confirmationReference: 42 },
    ])
      expect(editSchema.safeParse({ ...base, ...changes }).success).toBe(false);
  });
  it("requires an explicit offset and bounds reminder timestamps", () => {
    const base = {
      expectedRevision: 1,
      title: "Review a project",
      dueAt: "2026-12-01T09:00:00+08:00",
    };
    expect(followUpSchema.safeParse(base).success).toBe(true);
    for (const dueAt of ["2026-12-01T09:00:00", "not-a-date", "2200-01-01T00:00:00Z"])
      expect(followUpSchema.safeParse({ ...base, dueAt }).success).toBe(false);
  });
  it("does not let delayed reads replace newer revisions or resurrect locally deleted records", () => {
    const original = record(),
      updated = { ...original, revision: 2, note: "Current note" };
    expect(mergeApplication(updated, original)).toBe(updated);
    expect(mergeApplications([updated], [original], new Set())).toEqual([updated]);
    expect(mergeApplications([updated], [original], new Set([original.id]))).toEqual([]);
    expect(mergeApplication(updated, { ...updated, available: false }).available).toBe(false);
  });
  it("round-trips device-local dates to UTC and rejects nonexistent DST times", () => {
    const previous = process.env.TZ;
    try {
      process.env.TZ = "Asia/Taipei";
      expect(localInputToUtc("2026-12-01T09:30")).toBe("2026-12-01T01:30:00.000Z");
      expect(localDateInput("2026-12-01T01:30:00Z")).toBe("2026-12-01T09:30");
      expect(localInputToUtc("")).toBeNull();
      process.env.TZ = "America/New_York";
      expect(localInputToUtc("2026-03-08T02:30")).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
});
