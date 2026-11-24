import { afterAll, beforeAll, expect, it } from "vitest";
import { chromium, type Browser } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { LocalFixtures, type LocalMember } from "../support/local-fixtures";

let stack: LocalFixtures, member: LocalMember, admin: LocalMember, browser: Browser;
beforeAll(async () => {
  stack = await LocalFixtures.open();
  member = await stack.member();
  admin = await stack.member(true);
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
  await stack?.close();
});

/**
 * Scans signed-in screens with axe (WCAG 2.1 AA) in both themes and both languages; returns
 * readable failures. `openSections` expands every collapsible admin section first, because closed
 * sections unmount their editors and would otherwise never be scanned.
 */
async function scan(user: LocalMember, routes: string[], options: { openSections?: boolean } = {}) {
  const failures: string[] = [];
  for (const [theme, locale] of [
    ["light", "en"],
    ["dark", "en"],
    ["light", "zh-TW"],
    ["dark", "zh-TW"],
  ] as const) {
    const context = await browser.newContext({
      reducedMotion: "reduce",
      viewport: { width: 1280, height: 900 },
    });
    await context.addCookies(
      user.cookie.split("; ").map((pair) => {
        const at = pair.indexOf("=");
        return { name: pair.slice(0, at), value: pair.slice(at + 1), url: stack.origin };
      }),
    );
    await context.addInitScript(
      ([themeValue, localeValue]) => {
        localStorage.setItem("rolefoundry.theme.v1", themeValue);
        localStorage.setItem("rolefoundry.locale.v1", localeValue);
      },
      [theme, locale],
    );
    const page = await context.newPage();
    for (const route of routes) {
      await page.goto(`${stack.origin}${route}`);
      await page.locator("h1").first().waitFor();
      if (locale === "zh-TW") await page.locator('html[lang="zh-TW"]').waitFor();
      if (options.openSections)
        for (const summary of await page.locator("details.section-block > summary").all())
          await summary.click();
      await page.waitForLoadState("networkidle");
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      for (const violation of result.violations)
        failures.push(
          `${route} [${theme}, ${locale}] ${violation.id}: ${violation.nodes
            .slice(0, 3)
            .map(
              (node) =>
                `${node.target.join(" ")}${node.any[0]?.data?.contrastRatio ? ` (${node.any[0].data.contrastRatio}:1 ${node.any[0].data.fgColor} on ${node.any[0].data.bgColor})` : ""}`,
            )
            .join(", ")}`,
        );
    }
    await context.close();
  }
  return failures;
}

it("keeps signed-in member screens accessible in both themes and languages", async () => {
  expect(
    await scan(member, [
      "/account/",
      "/skills/",
      "/jobs/",
      "/assessments/",
      "/matches/",
      "/learning/",
      "/resume/",
      "/applications/",
      "/dictionary/",
    ]),
  ).toEqual([]);
}, 240000);

it("keeps every administrator section accessible in both themes and languages", async () => {
  expect(await scan(admin, ["/admin/"], { openSections: true })).toEqual([]);
}, 240000);
