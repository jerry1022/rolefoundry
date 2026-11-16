import { randomUUID as id } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { ZipFile } from "yazl";
import PDFDocument from "pdfkit";
import { describe, it, expect } from "vitest";
import { IsolatedResumeProcessor } from "../../src/modules/resume/adapters/isolated-process";
import { resumeLimits } from "../../src/modules/resume/model";
import type { ConfirmedResume } from "../../src/modules/resume/model";
import { resumeText } from "../../src/modules/resume/rules";
const processor = new IsolatedResumeProcessor(),
  signal = () => new AbortController().signal;
const PDF = "application/pdf",
  DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
async function zip(entries: Record<string, string | Buffer>) {
  const zip = new ZipFile(),
    chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    zip.outputStream.on("data", (chunk) => chunks.push(chunk));
    zip.outputStream.once("end", () => resolve(Buffer.concat(chunks)));
    zip.outputStream.once("error", reject);
  });
  for (const [name, value] of Object.entries(entries)) zip.addBuffer(Buffer.from(value), name);
  zip.end();
  return await done;
}
const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
async function docx(text: string, extra: Record<string, string | Buffer> = {}) {
  return await zip({
    "[Content_Types].xml":
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    "_rels/.rels":
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    "word/document.xml": `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${text
      .split("\n")
      .map((line) => `<w:p><w:r><w:t>${escape(line)}</w:t></w:r></w:p>`)
      .join("")}<w:sectPr/></w:body></w:document>`,
    ...extra,
  });
}
async function pdf(text: string, options: PDFKit.PDFDocumentOptions = {}, image?: Buffer) {
  const document = new PDFDocument(options),
    chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    document.on("data", (chunk) => chunks.push(chunk));
    document.once("end", () => resolve(Buffer.concat(chunks)));
    document.once("error", reject);
  });
  if (text) document.text(text);
  if (image) document.image(image, { width: 320 });
  document.end();
  return await done;
}
function content(): ConfirmedResume {
  const facts = [
    {
      id: id(),
      text: "Jerry Huang - software engineer\nTaipei, Taiwan",
      kind: "contact" as const,
      state: "unspecified" as const,
      skillIds: [],
      sourceBlockId: null,
    },
    {
      id: id(),
      text: "Built a retrieval prototype using Python. Evaluation is ongoing.\n使用繁體中文測試檢索結果，保留實際專案進度。",
      kind: "project" as const,
      state: "in-progress" as const,
      skillIds: ["python", "rag"],
      sourceBlockId: null,
    },
    {
      id: id(),
      text: "Study deployment practices and document a future experiment.",
      kind: "other" as const,
      state: "learning" as const,
      skillIds: [],
      sourceBlockId: null,
    },
  ];
  return {
    facts,
    sections: [
      { id: id(), heading: "Profile", factIds: [facts[0].id] },
      { id: id(), heading: "Projects / 專案", factIds: [facts[1].id] },
      { id: id(), heading: "Learning / 學習計畫", factIds: [facts[2].id] },
    ],
  };
}
const noWhitespace = (text: string) => text.replace(/\s/g, "");
describe("actual isolated document processing", () => {
  it("extracts text PDF and DOCX into bounded source spans for owner review", async () => {
    for (const [bytes, media] of [
      [await pdf("Authored test resume\nBuilt a Python prototype."), PDF],
      [await docx("Authored test resume\n繁體中文履歷\nBuilt a prototype in progress."), DOCX],
    ] as const) {
      const draft = await processor.parse(bytes, media, signal());
      expect(draft.text).toContain("Authored test resume");
      expect(draft.warnings).toContain("review-extracted-text");
      for (const block of draft.blocks)
        expect(draft.text.slice(block.source.start, block.source.end)).toBe(block.text);
      if (media === DOCX) expect(draft.text).toContain("繁體中文履歷");
    }
  });
  it("rejects scanned/empty, malformed, encrypted and disguised files without publishing partial content", async () => {
    for (const [bytes, media, code] of [
      [await pdf(""), PDF, "empty-text"],
      [await pdf("", {}, await readFile("docs/assets/dashboard.png")), PDF, "empty-text"],
      [await docx(""), DOCX, "empty-text"],
      [Buffer.from("%PDF-1.7\nmalformed"), PDF, "invalid-file"],
      [Buffer.from("not a DOCX"), DOCX, "invalid-file"],
      [await docx("wrong media"), PDF, "invalid-file"],
      [
        await pdf("Private encrypted text", { userPassword: "secret-password" }),
        PDF,
        "password-protected",
      ],
    ] as const)
      await expect(processor.parse(bytes, media, signal())).rejects.toMatchObject({ code });
  });
  it("bounds file size, page counts and ZIP inflation and rejects active/DTD content", async () => {
    await expect(
      processor.parse(new Uint8Array(resumeLimits.sourceBytes + 1), PDF, signal()),
    ).rejects.toMatchObject({ code: "too-large" });
    const document = new PDFDocument(),
      chunks: Buffer[] = [];
    const many = new Promise<Buffer>((resolve) => {
      document.on("data", (chunk) => chunks.push(chunk));
      document.on("end", () => resolve(Buffer.concat(chunks)));
    });
    for (let i = 0; i < 21; i++) {
      if (i) document.addPage();
      document.text("Page " + i);
    }
    document.end();
    await expect(processor.parse(await many, PDF, signal())).rejects.toMatchObject({
      code: "too-large",
    });
    const bomb = await docx("Small visible text", {
      "word/oversize.xml": "x".repeat(resumeLimits.inflatedBytes + 1),
    });
    await expect(processor.parse(bomb, DOCX, signal())).rejects.toMatchObject({
      code: "too-large",
    });
    const invalidExtras: Record<string, string | Buffer>[] = [
      { "word/vbaProject.bin": "not executable" },
      { "word/embeddings/object.bin": "ignored object" },
      {
        "word/extra.xml":
          '<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///etc/passwd">]><x>&secret;</x>',
      },
      {
        "word/extra.xml": Buffer.from(
          '\ufeff<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///etc/passwd">]><x>&secret;</x>',
          "utf16le",
        ),
      },
    ];
    for (const extra of invalidExtras)
      await expect(
        processor.parse(await docx("Test", extra), DOCX, signal()),
      ).rejects.toMatchObject({ code: "unsupported-file" });
  });
  it("exports exact accepted English/Traditional Chinese text with visible in-progress/learning labels", async () => {
    const accepted = content(),
      bytes = await processor.render(accepted, signal());
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
    const extracted = await processor.parse(bytes, PDF, signal());
    expect(noWhitespace(extracted.text)).toBe(noWhitespace(resumeText(accepted)));
    await mkdir(".local", { recursive: true });
    await writeFile(".local/resume-export-reviewed.pdf", bytes);
  });
  it("fails unsupported glyphs explicitly instead of dropping claims and keeps source content unchanged", async () => {
    const accepted = content();
    accepted.facts[0].text += " 🧑‍🚀";
    const copy = structuredClone(accepted);
    await expect(processor.render(accepted, signal())).rejects.toMatchObject({
      code: "unsupported-glyph",
    });
    expect(accepted).toEqual(copy);
  });
  it("preserves text across actual page breaks without clipping or silently dropping statements", async () => {
    const accepted = content(),
      base = accepted.facts[1];
    accepted.facts = Array.from({ length: 12 }, (_, index) => ({
      ...base,
      id: id(),
      text:
        `Authored statement ${index}. ` +
        "Built a retrieval prototype and documented the observed behavior. ".repeat(8),
    }));
    accepted.sections = Array.from({ length: 3 }, (_, index) => ({
      id: id(),
      heading: `Projects ${index + 1} / 專案`,
      factIds: accepted.facts.slice(index * 4, index * 4 + 4).map((fact) => fact.id),
    }));
    const bytes = await processor.render(accepted, signal()),
      extracted = await processor.parse(bytes, PDF, signal());
    expect(extracted.pageCount).toBeGreaterThan(1);
    expect(noWhitespace(extracted.text)).toBe(noWhitespace(resumeText(accepted)));
    await writeFile(".local/resume-export-multipage.pdf", bytes);
  });
  it("cancels/terminates processing without leaking source text through diagnostics", async () => {
    const controller = new AbortController();
    controller.abort(new Error("test cancellation"));
    await expect(
      processor.parse(await docx("Private test body"), DOCX, controller.signal),
    ).rejects.toThrow("test cancellation");
    await expect(
      new IsolatedResumeProcessor(1).parse(await docx("Private test body"), DOCX, signal()),
    ).rejects.toMatchObject({ code: "parse-timeout" });
    await expect(
      processor.parse(Buffer.from("Private test body"), PDF, signal()),
    ).rejects.not.toThrow("Private test body");
  });
});
