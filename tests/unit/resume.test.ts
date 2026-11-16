import { randomUUID as id } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  confirmedResumeSchema,
  extractedResumeSchema,
  uploadIntentSchema,
} from "../../src/modules/resume/model";
import type { ConfirmedResume, ResumeRevisionInput } from "../../src/modules/resume/model";
import {
  extractedText,
  proposeResumeOrder,
  validateResumeRevision,
  acceptResumeChanges,
  resumeText,
} from "../../src/modules/resume/rules";
function input(): ResumeRevisionInput {
  const facts = [
    {
      id: id(),
      text: "Maintained a documentation index.",
      kind: "experience" as const,
      state: "completed" as const,
      skillIds: ["content"],
      sourceBlockId: null,
    },
    {
      id: id(),
      text: "Built a retrieval prototype; evaluation is ongoing.",
      kind: "project" as const,
      state: "in-progress" as const,
      skillIds: ["rag"],
      sourceBlockId: null,
    },
    {
      id: id(),
      text: "Plan to study agent orchestration.",
      kind: "other" as const,
      state: "learning" as const,
      skillIds: ["agents"],
      sourceBlockId: null,
    },
    {
      id: id(),
      text: "Completed an independent Python exercise.",
      kind: "project" as const,
      state: "completed" as const,
      skillIds: ["python"],
      sourceBlockId: null,
    },
    {
      id: id(),
      text: "Maintained internal documentation.",
      kind: "experience" as const,
      state: "completed" as const,
      skillIds: ["content"],
      sourceBlockId: null,
    },
  ];
  return {
    version: {
      id: id(),
      documentId: id(),
      version: 1,
      createdAt: new Date().toISOString(),
      content: {
        facts,
        sections: [
          { id: id(), heading: "Projects", factIds: facts.slice(0, 3).map((f) => f.id) },
          { id: id(), heading: "Other experience", factIds: [facts[4].id, facts[3].id] },
        ],
      },
    },
    target: { jobId: id(), jobVersionId: id(), skillIds: ["rag", "python", "agents", "unmapped"] },
  };
}
describe("resume fact boundaries", () => {
  it("preserves normalized source spans across pages and separates the draft from confirmation", () => {
    const parsed = extractedText(
      [
        { text: "  Jerry\r\n\r\nBuilt a prototype.  ", page: 1 },
        { text: "\tLearning Python", page: 2 },
      ],
      id,
    );
    expect(parsed.pageCount).toBe(2);
    expect(parsed.blocks.map((block) => block.text)).toEqual([
      "Jerry",
      "Built a prototype.",
      "Learning Python",
    ]);
    for (const block of parsed.blocks)
      expect(parsed.text.slice(block.source.start, block.source.end)).toBe(block.text);
    const forged = structuredClone(parsed);
    forged.blocks[0].source.end++;
    expect(extractedResumeSchema.safeParse(forged).success).toBe(false);
    expect(() => extractedText([{ text: "  \n ", page: null }], id)).toThrow("empty-text");
  });
  it("requires bounded supported upload metadata and one owner-confirmed placement for every fact", () => {
    expect(
      uploadIntentSchema.safeParse({
        filename: "resume.pdf",
        mediaType: "application/pdf",
        byteCount: 1200,
      }).success,
    ).toBe(true);
    for (const change of [
      { filename: "../resume.pdf" },
      { filename: "resume.exe" },
      { byteCount: 6 * 1024 * 1024 },
      { mediaType: "text/html" },
    ])
      expect(
        uploadIntentSchema.safeParse({
          filename: "resume.pdf",
          mediaType: "application/pdf",
          byteCount: 1200,
          ...change,
        }).success,
      ).toBe(false);
    const content = input().version.content;
    expect(confirmedResumeSchema.safeParse(content).success).toBe(true);
    const orphan = structuredClone(content);
    orphan.sections[0].factIds.pop();
    expect(confirmedResumeSchema.safeParse(orphan).success).toBe(false);
    const duplicate = structuredClone(content);
    duplicate.sections[1].factIds.push(duplicate.sections[0].factIds[0]);
    expect(confirmedResumeSchema.safeParse(duplicate).success).toBe(false);
  });
  it("creates target-specific order proposals without changing any statement or learning state", () => {
    const source = input(),
      proposal = proposeResumeOrder(source, id);
    expect(proposal.changes).toHaveLength(2);
    expect(proposal.changes[0].factIds[0]).toBe(source.version.content.facts[1].id);
    expect(proposal.changes[0].afterText).toContain("evaluation is ongoing");
    expect(proposal.questions.map((question) => question.skillId)).toEqual(["agents", "unmapped"]);
    expect(validateResumeRevision(source, proposal)).toEqual(proposal);
    expect(resumeText(source.version.content)).toContain("[In progress]");
    expect(resumeText(source.version.content)).toContain("[Learning goal]");
  });
  it("rejects invented metrics, foreign facts/sections, missing facts and stale versions from replacement adapters", () => {
    const source = input(),
      original = proposeResumeOrder(source, id);
    const edits = [
      (p: typeof original) => {
        p.changes[0].afterText += " Increased revenue by 300%.";
      },
      (p: typeof original) => {
        p.changes[0].factIds[0] = id();
      },
      (p: typeof original) => {
        p.changes[0].factIds.pop();
      },
      (p: typeof original) => {
        p.changes[0].sectionId = id();
      },
      (p: typeof original) => {
        p.changes.push(p.changes[0]);
      },
      (p: typeof original) => {
        p.changes[0].beforeText = "New baseline";
      },
      (p: typeof original) => {
        p.jobVersionId = id();
      },
      (p: typeof original) => {
        p.versionId = id();
      },
      (p: typeof original) => {
        p.questions[0].skillId = "invented";
      },
    ];
    for (const edit of edits) {
      const output = structuredClone(original);
      edit(output);
      expect(() => validateResumeRevision(source, output)).toThrow("invalid-output");
    }
  });
  it("accepts changes independently and leaves the immutable source and rejected sections unchanged", () => {
    const source = input(),
      copy = structuredClone(source),
      output = proposeResumeOrder(source, id);
    const accepted = acceptResumeChanges(source, output, [output.changes[0].id]);
    expect(accepted.sections[0].factIds).toEqual(output.changes[0].factIds);
    expect(accepted.sections[1]).toEqual(source.version.content.sections[1]);
    expect(accepted.facts).toEqual(source.version.content.facts);
    expect(source).toEqual(copy);
    expect(acceptResumeChanges(source, output, [])).toEqual(copy.version.content);
    expect(() => acceptResumeChanges(source, output, [id()])).toThrow("invalid-output");
    expect(() =>
      acceptResumeChanges(source, output, [output.changes[0].id, output.changes[0].id]),
    ).toThrow("invalid-output");
  });
});

describe("replaceable resume execution ports", () => {
  const lease = {
    taskId: id(),
    messageId: "1",
    kind: "resume.parse" as const,
    token: id(),
    leaseSeconds: 30,
  };
  it("validates sealed file length and extracted spans before publishing a draft", async () => {
    const { ResumeParseHandler } = await import("../../src/modules/resume/handler");
    const { vi } = await import("vitest");
    const draft = extractedText([{ text: "A real confirmed draft for review.", page: 1 }], id);
    const publish = vi.fn(),
      parse = vi.fn(async () => draft);
    await expect(
      new ResumeParseHandler(
        {
          load: async () => ({
            mediaType: "application/pdf",
            byteCount: 2,
            bytes: new Uint8Array([1]),
          }),
          publish,
        },
        { parse },
      ).execute(lease, new AbortController().signal),
    ).rejects.toMatchObject({ category: "validation" });
    expect(parse).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    const valid = {
      load: async () => ({
        mediaType: "application/pdf" as const,
        byteCount: 1,
        bytes: new Uint8Array([1]),
      }),
      publish,
    };
    await new ResumeParseHandler(valid, { parse }).execute(lease, new AbortController().signal);
    expect(publish).toHaveBeenCalledWith(lease, draft, expect.any(AbortSignal));
    publish.mockClear();
    const forged = structuredClone(draft);
    forged.blocks[0].text = "Invented text";
    await expect(
      new ResumeParseHandler(valid, { parse: async () => forged }).execute(
        lease,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ category: "validation" });
    expect(publish).not.toHaveBeenCalled();
  });
  it("rejects a replaced reviser that adds claims and prevents publication after cancellation", async () => {
    const { ResumeRevisionHandler } = await import("../../src/modules/resume/handler");
    const { vi } = await import("vitest");
    const source = input(),
      publish = vi.fn(),
      output = proposeResumeOrder(source, id);
    const fabricated = structuredClone(output);
    fabricated.changes[0].afterText += " Certified AI architect.";
    const store = { load: async () => source, publish };
    await expect(
      new ResumeRevisionHandler(store, { propose: async () => fabricated }).execute(
        { ...lease, kind: "resume.revise" },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ category: "validation" });
    const controller = new AbortController();
    await expect(
      new ResumeRevisionHandler(store, {
        propose: async () => {
          controller.abort();
          return output;
        },
      }).execute({ ...lease, kind: "resume.revise" }, controller.signal),
    ).rejects.toMatchObject({ category: "canceled" });
    expect(publish).not.toHaveBeenCalled();
  });
  it("checks exported text independently and preserves Latin word boundaries in verification", async () => {
    const { ResumeExportHandler } = await import("../../src/modules/resume/handler");
    const { resumeContentTokens } = await import("../../src/modules/resume/rules");
    const { vi } = await import("vitest");
    const version = input().version,
      publish = vi.fn(),
      bytes = new TextEncoder().encode("%PDF-fake");
    const render = { render: async () => bytes },
      store = { load: async () => version, publish };
    const correct = extractedText([{ text: resumeText(version.content), page: 1 }], id);
    await new ResumeExportHandler(store, render, { parse: async () => correct }).execute(
      { ...lease, kind: "resume.export" },
      new AbortController().signal,
    );
    expect(publish).toHaveBeenCalledWith(
      { ...lease, kind: "resume.export" },
      bytes,
      expect.any(AbortSignal),
    );
    publish.mockClear();
    const wrong = extractedText([{ text: "Invented award and certification.", page: 1 }], id);
    await expect(
      new ResumeExportHandler(store, render, { parse: async () => wrong }).execute(
        { ...lease, kind: "resume.export" },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ category: "validation" });
    expect(publish).not.toHaveBeenCalled();
    expect(resumeContentTokens("now here")).not.toEqual(resumeContentTokens("nowhere"));
    expect(resumeContentTokens("繁體中文")).toEqual(resumeContentTokens("繁 體 中 文"));
  });
});
