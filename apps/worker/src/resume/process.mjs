// No runtime credentials are passed to this process; its stdout is a bounded protocol, never logs.
import limits from "../../../../src/modules/resume/limits.json" with { type: "json" };
globalThis.fetch = async () => {
  throw new Error("Network requests are disabled in document processing.");
};
const safeCodes = new Set([
  "invalid-file",
  "unsupported-file",
  "too-large",
  "empty-text",
  "password-protected",
  "unsupported-glyph",
  "invalid-output",
]);
let input = "";
try {
  for await (const chunk of process.stdin) {
    input += chunk.toString("utf8");
    if (input.length > Math.ceil((limits.sourceBytes * 4) / 3) + 10000)
      throw Object.assign(new Error("limit"), { safeCode: "too-large" });
  }
  const request = JSON.parse(input);
  // Library warnings may contain document text; never forward them to either parent pipe.
  for (const method of ["log", "warn", "error", "info", "debug"]) console[method] = () => {};
  if (request.operation === "parse") {
    const { parseResume } = await import("./parse.mjs");
    const result = await parseResume(Buffer.from(request.bytes, "base64"), request.mediaType);
    process.stdout.write(JSON.stringify({ ok: true, ...result }));
  } else if (request.operation === "render") {
    const sections = request.sections;
    if (
      !Array.isArray(sections) ||
      !sections.length ||
      sections.length > limits.sections ||
      sections.some(
        (section) =>
          typeof section.heading !== "string" ||
          section.heading.length > 120 ||
          !Array.isArray(section.statements) ||
          section.statements.length > limits.facts ||
          section.statements.some((text) => typeof text !== "string" || text.length > 4100),
      )
    )
      throw Error("invalid");
    const { renderResume } = await import("./render.mjs");
    const bytes = await renderResume(sections);
    process.stdout.write(JSON.stringify({ ok: true, bytes: bytes.toString("base64") }));
  } else throw Error("invalid");
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      ok: false,
      code: safeCodes.has(error?.safeCode) ? error.safeCode : "invalid-file",
    }),
  );
  process.exitCode = 1;
}
