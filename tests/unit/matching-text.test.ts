import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { loadMessages, translate } from "../../src/lib/i18n";
import { fixedMatchingText, matchingText } from "../../src/components/matching/matching-text";

// The zh-TW catalogue is loaded on demand, as in the browser.
beforeAll(() => loadMessages("zh-TW"));

const zh = (source: string, vars?: Record<string, string | number>) =>
  translate("zh-TW", source, vars);

describe("matching report sentences in Traditional Chinese", () => {
  it("lists every fixed sentence the rules can store", () => {
    const source = readFileSync("src/modules/matching/rules.ts", "utf8");
    const sentences = [...source.matchAll(/"([A-Z][^"]{20,}\.)"/g)].map((match) => match[1]);
    expect(sentences.length).toBeGreaterThan(10);
    for (const sentence of sentences) expect(fixedMatchingText).toContain(sentence);
  });

  it("translates stored sentences and templated requirements", () => {
    for (const sentence of fixedMatchingText) expect(matchingText(sentence, zh)).not.toBe(sentence);
    expect(matchingText("At least 3 years", zh)).toBe("至少 3 年");
    expect(matchingText("Must be authorized to work in Taiwan", zh)).toBe(
      "Must be authorized to work in Taiwan",
    );
  });
});
