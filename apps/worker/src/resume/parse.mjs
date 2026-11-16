import yauzl from "yauzl";
import mammoth from "mammoth";
import limits from "../../../../src/modules/resume/limits.json" with { type: "json" };
const fail = (code) => {
  throw Object.assign(new Error(code), { safeCode: code });
};

// Validate the complete archive before handing it to a document library. No paths are extracted.
async function validateDocx(bytes) {
  const zip = await new Promise((resolve, reject) =>
    yauzl.fromBuffer(
      bytes,
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (error, zip) => (error ? reject(error) : resolve(zip)),
    ),
  );
  await new Promise((resolve, reject) => {
    let total = 0,
      count = 0,
      done = false;
    const names = new Set();
    const stop = (error) => {
      if (!done) {
        done = true;
        zip.close();
        reject(error);
      }
    };
    zip.on("error", stop);
    zip.on("end", () => {
      if (done) return;
      done = true;
      if (!names.has("word/document.xml") || !names.has("[Content_Types].xml"))
        return reject(Object.assign(new Error("invalid"), { safeCode: "invalid-file" }));
      resolve();
    });
    zip.on("entry", (entry) => {
      if (done) return;
      if (
        ++count > limits.zipEntries ||
        entry.uncompressedSize > limits.inflatedBytes ||
        total + entry.uncompressedSize > limits.inflatedBytes
      )
        return stop(Object.assign(new Error("limit"), { safeCode: "too-large" }));
      const name = entry.fileName;
      if (
        names.has(name) ||
        entry.isEncrypted() ||
        /(?:^|\/)\.\.(?:\/|$)|^\/|\\|\x00/.test(name) ||
        /(?:vbaProject\.bin|\/embeddings\/|\.docm$)/i.test(name)
      )
        return stop(Object.assign(new Error("invalid"), { safeCode: "unsupported-file" }));
      names.add(name);
      if (name.endsWith("/")) {
        zip.readEntry();
        return;
      }
      zip.openReadStream(entry, (error, stream) => {
        if (error) return stop(error);
        let actual = 0,
          xml = "";
        const inspect = /\.(xml|rels)$/i.test(name);
        stream.on("error", stop);
        stream.on("data", (chunk) => {
          actual += chunk.length;
          total += chunk.length;
          if (actual > entry.uncompressedSize || total > limits.inflatedBytes) {
            stream.destroy();
            return stop(Object.assign(new Error("limit"), { safeCode: "too-large" }));
          }
          if (inspect) xml += chunk.toString("utf8");
        });
        stream.on("end", () => {
          if (done) return;
          if (inspect && (xml.includes("\u0000") || /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)))
            return stop(Object.assign(new Error("xml"), { safeCode: "unsupported-file" }));
          zip.readEntry();
        });
      });
    });
    zip.readEntry();
  });
}

export async function parseResume(bytes, mediaType) {
  if (!bytes.length) fail("empty-text");
  if (bytes.length > limits.sourceBytes) fail("too-large");
  if (mediaType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    if (bytes.readUInt32LE(0) !== 0x04034b50) fail("invalid-file");
    await validateDocx(bytes);
    // Buffer input, raw text only, default external file access disabled; no HTML/images.
    const result = await mammoth.extractRawText({ buffer: bytes });
    if (result.value.length > limits.textCharacters) fail("too-large");
    const parsed = {
      pages: [{ text: result.value, page: null }],
      documentWarnings: result.messages.length > 0,
    };
    if (result.messages.some((message) => message.type === "error")) fail("invalid-file");
    return parsed;
  }
  if (mediaType !== "application/pdf") fail("unsupported-file");
  if (!bytes.subarray(0, 8).toString("ascii").startsWith("%PDF-")) fail("invalid-file");
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = getDocument({
    data: Uint8Array.from(bytes),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    useWasm: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    stopAtErrors: true,
    verbosity: 0,
  });
  let pdf;
  try {
    pdf = await loading.promise;
    if (pdf.numPages > limits.sourcePages) fail("too-large");
    const pages = [];
    let count = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number),
        content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        text += item.str + (item.hasEOL ? "\n" : " ");
        count += item.str.length;
        if (count > limits.textCharacters) fail("too-large");
      }
      pages.push({ text, page: number });
      page.cleanup();
    }
    return { pages, documentWarnings: false };
  } catch (error) {
    if (error?.name === "PasswordException") fail("password-protected");
    throw error;
  } finally {
    await loading.destroy();
  }
}
