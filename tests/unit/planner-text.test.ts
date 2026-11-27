import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { loadMessages, translate } from "../../src/lib/i18n";
import { fixedPlannerText, plannerText } from "../../src/components/learning/planner-text";

// The zh-TW catalogue is loaded on demand, as in the browser.
beforeAll(() => loadMessages("zh-TW"));

const zh = (source: string, vars?: Record<string, string | number>) =>
  translate("zh-TW", source, vars);

describe("planner sentences in Traditional Chinese", () => {
  it("lists every fixed sentence the planner can store", () => {
    const source = readFileSync("src/modules/learning/planner.ts", "utf8");
    // Double-quoted English sentences: issue reasons, notes and plan limitations.
    const sentences = [...source.matchAll(/"([A-Z][^"]{20,}\.)"/g)].map((match) => match[1]);
    expect(sentences.length).toBeGreaterThan(10);
    for (const sentence of sentences) expect(fixedPlannerText).toContain(sentence);
  });

  it("translates fixed and generated sentences and leaves other text alone", () => {
    for (const sentence of fixedPlannerText) expect(plannerText(sentence, zh)).not.toBe(sentence);
    expect(
      plannerText(
        "Complete the assigned 45 study minutes, keep notes and continue the remaining work in a later plan. This step does not mean course completion.",
        zh,
      ),
    ).toContain("45");
    expect(plannerText("Practice rag", zh)).toBe("練習 rag");
    expect(
      plannerText(
        "Create a small example demonstrating rag; describe its limits and one test.",
        zh,
      ),
    ).toContain("rag");
    expect(plannerText("Retrieval Augmented Generation (RAG)", zh)).toBe(
      "Retrieval Augmented Generation (RAG)",
    );
  });
});
