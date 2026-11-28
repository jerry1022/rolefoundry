import { beforeAll, describe, expect, it } from "vitest";
import { formatters, loadMessages, translate } from "../../src/lib/i18n";
import { zhTW, zhTWSections } from "../../src/lib/messages/zh-TW/index";
import { ja } from "../../src/lib/messages/ja/index";

// The zh-TW catalogue is loaded on demand, as in the browser.
beforeAll(() => Promise.all([loadMessages("zh-TW"), loadMessages("ja")]));

describe("locale messages", () => {
  it("loads Chinese and Japanese concurrently without mixing catalogues", () => {
    expect(translate("ja", "Overview")).toBe("概要");
    expect(translate("zh-TW", "Overview")).toBe("總覽");
    expect(translate("ja", "{n}% overlap", { n: 75 })).toBe("重なり 75%");
    expect(translate("ja", "Missing source {id}", { id: 7 })).toBe("Missing source 7");
    expect(Object.keys(ja).sort()).toEqual(Object.keys(zhTW).sort());
    const names = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [source, target] of Object.entries(ja)) {
      expect(target.trim(), source).not.toBe("");
      expect(names(target), source).toEqual(names(source));
    }
  });
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
    const japanese = formatters("ja");
    expect(japanese.monthlyRange(90000, 140000)).toBe("NT$9万–14万 / 月");
    expect(japanese.date("2026-11-24T12:00:00Z")).toMatch(/2026年11月24日/);
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

describe("server messages", () => {
  it("translates thrown and mapped database messages for zh-TW viewers", () => {
    for (const message of [
      "Sign in to continue.",
      "The data changed. Reload before trying again.",
      "The weekly analysis limit has been reached.",
    ])
      expect(translate("zh-TW", message)).not.toBe(message);
    expect(translate("en", "Sign in to continue.")).toBe("Sign in to continue.");
  });
});
