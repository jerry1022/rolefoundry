import { readFile } from "node:fs/promises";
import PDFDocument from "pdfkit";
import { create } from "fontkit";
import limits from "../../../../src/modules/resume/limits.json" with { type: "json" };
const fail = (code) => {
  throw Object.assign(new Error(code), { safeCode: code });
};
export async function renderResume(sections) {
  // Parent and child entry validate structure; only confirmed headings and exact fact text render.
  const fontBytes = await readFile(
    new URL("../../../../assets/fonts/NotoSansCJKtc-Regular.otf", import.meta.url),
  );
  const font = create(fontBytes);
  const allText = sections
    .map((section) => section.heading + "\n" + section.statements.join("\n\n"))
    .join("\n\n");
  for (const character of allText) {
    if (!/\s/u.test(character) && !font.hasGlyphForCodePoint(character.codePointAt(0)))
      fail("unsupported-glyph");
  }
  const document = new PDFDocument({
    size: "A4",
    margin: 48,
    autoFirstPage: true,
    bufferPages: false,
    info: { Title: "Resume", Author: "", Creator: "RoleFoundry controlled resume template" },
    font: fontBytes,
  });
  const chunks = [];
  let byteCount = 0,
    pages = 1;
  return await new Promise((resolve, reject) => {
    document.on("data", (chunk) => {
      byteCount += chunk.length;
      if (byteCount > limits.exportBytes) {
        document.destroy();
        reject(Object.assign(new Error("limit"), { safeCode: "too-large" }));
        return;
      }
      chunks.push(chunk);
    });
    document.on("error", reject);
    document.on("pageAdded", () => {
      if (++pages > limits.sourcePages) {
        document.destroy();
        reject(Object.assign(new Error("limit"), { safeCode: "too-large" }));
      }
    });
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.font(fontBytes);
    for (const section of sections) {
      if (document.y > document.page.height - 130) document.addPage();
      document.fontSize(13).fillColor("#214f42").text(section.heading, { lineGap: 3 });
      document.moveDown(0.4);
      for (const text of section.statements) {
        document.fontSize(10).fillColor("#182b23").text(text, { lineGap: 3, paragraphGap: 7 });
        document.moveDown(0.5);
      }
      document.moveDown(0.6);
    }
    document.end();
  });
}
