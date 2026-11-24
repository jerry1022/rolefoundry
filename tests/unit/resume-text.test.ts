import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { translate } from "../../src/lib/i18n";
import { fixedResumeText, resumeText } from "../../src/components/resume/resume-text";

describe("resume proposal sentences in Traditional Chinese", () => {
  it("lists and translates every fixed sentence the rules can store", () => {
    const source = readFileSync("src/modules/resume/rules.ts", "utf8");
    const sentences = [...source.matchAll(/"([A-Z][^"]{20,}[.?])"/g)].map((match) => match[1]);
    expect(sentences.length).toBeGreaterThanOrEqual(5);
    for (const sentence of sentences) {
      expect(fixedResumeText).toContain(sentence);
      expect(resumeText(sentence, (value) => translate("zh-TW", value))).not.toBe(sentence);
    }
  });
});
