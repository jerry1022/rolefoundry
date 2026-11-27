import { describe, expect, it } from "vitest";
import { formatters, translate } from "../../src/lib/i18n";
import { zhTW, zhTWSections } from "../../src/lib/messages/zh-TW/index";

describe("locale messages", () => {
  it("falls back to English and interpolates named placeholders", () => {
    expect(translate("en", "{n}% overlap", { n: 75 })).toBe("75% overlap");
    expect(translate("zh-TW", "{n}% overlap", { n: 75 })).toBe("重疊 75%");
    expect(translate("zh-TW", "An untranslated sentence.")).toBe("An untranslated sentence.");
    expect(translate("zh-TW", "Good things ahead, {name}.", {})).toBe("{name}，好事正在前方。");
  });

  it("keeps every placeholder of the English key in its translation", () => {
    const names = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [source, target] of Object.entries(zhTW))
      expect(names(target), source).toEqual(names(source));
  });

  it("splits translations into non-overlapping product areas", () => {
    const keys = Object.values(zhTWSections).flatMap((section) => Object.keys(section));
    expect(new Set(keys).size).toBe(keys.length);
    expect(Object.keys(zhTW)).toHaveLength(keys.length);
  });
});

describe("locale formatting", () => {
  it("formats numbers, dates, lists and TWD salary ranges per locale", () => {
    const en = formatters("en");
    const zh = formatters("zh-TW");
    expect(en.number(30000)).toBe("30,000");
    expect(zh.number(30000)).toBe("30,000");
    expect(en.monthlyRange(90000, 140000)).toBe("NT$90k–140k / month");
    expect(zh.monthlyRange(90000, 140000)).toBe("NT$9萬–14萬 / 月");
    expect(en.list(["Python", "SQL"])).toBe("Python and SQL");
    expect(zh.list(["Python", "SQL"])).toBe("Python和SQL");
    expect(zh.date("2026-11-24T00:00:00Z")).toMatch(/2026年11月2[34]日/);
    expect(en.date("not a date")).toBe("");
  });
});
