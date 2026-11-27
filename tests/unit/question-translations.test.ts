import { describe, expect, it } from "vitest";
import {
  localizedQuestion,
  questionTranslationInputSchema,
} from "../../src/modules/assessment/model";

const item = {
  prompt: "Which check comes first?",
  options: ["Verify the source", "Skip it"],
  translations: {
    "zh-TW": {
      prompt: "應先做哪項檢查？",
      options: ["查核來源", "略過"],
      reviewedAt: "2026-11-24T00:00:00Z",
    },
  },
};

describe("reviewed question translations", () => {
  it("keeps option order so the selected index means the same answer", () => {
    const text = localizedQuestion(item, "zh-TW");
    expect(text).toMatchObject({ prompt: "應先做哪項檢查？", lang: "zh-Hant", explanation: null });
    expect(text.options[0]).toBe("查核來源");
    expect(localizedQuestion(item, "en").options).toEqual(item.options);
  });

  it("falls back to the source when the options do not align", () => {
    const misaligned = {
      ...item,
      translations: { "zh-TW": { ...item.translations["zh-TW"], options: ["查核來源"] } },
    };
    expect(localizedQuestion(misaligned, "zh-TW").lang).toBe("en");
  });

  it("shows a translated explanation only when the server included it", () => {
    const graded = {
      ...item,
      translations: { "zh-TW": { ...item.translations["zh-TW"], explanation: "先查核。" } },
    };
    expect(localizedQuestion(graded, "zh-TW").explanation).toBe("先查核。");
  });

  it("requires a review note and rejects unknown fields", () => {
    const input = {
      locale: "zh-TW",
      prompt: "題目",
      options: ["一", "二"],
      explanation: "解說",
      reviewNote: "Editor review",
    };
    expect(questionTranslationInputSchema.safeParse(input).success).toBe(true);
    expect(questionTranslationInputSchema.safeParse({ ...input, reviewNote: "" }).success).toBe(
      false,
    );
    expect(questionTranslationInputSchema.safeParse({ ...input, correctIndex: 1 }).success).toBe(
      false,
    );
  });
});
