import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("stylesheet compatibility", () => {
  it("never hand-writes -webkit-backdrop-filter", () => {
    // The CSS compiler adds vendor prefixes itself. A rule that declares both the standard and the
    // prefixed property loses both in the compiled output, which silently removed the top bar,
    // hero card and floating-label blur.
    for (const file of ["src/app/globals.css", "src/app/theme-dark.css"])
      expect(readFileSync(file, "utf8")).not.toMatch(/-webkit-backdrop-filter/);
  });
});
