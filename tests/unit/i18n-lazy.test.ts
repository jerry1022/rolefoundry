import { describe, expect, it } from "vitest";
import { loadMessages, translate } from "../../src/lib/i18n";

describe("on-demand zh-TW catalogue", () => {
  it("falls back to English until the catalogue loads, then translates", async () => {
    expect(translate("zh-TW", "Sign in to continue.")).toBe("Sign in to continue.");
    await Promise.all([loadMessages("zh-TW"), loadMessages("zh-TW")]);
    expect(translate("zh-TW", "Sign in to continue.")).toBe("請登入以繼續。");
    await expect(loadMessages("en")).resolves.toBeUndefined();
  });
});
