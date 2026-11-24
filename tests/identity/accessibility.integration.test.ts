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

/** Scans signed-in screens with axe (WCAG 2.1 AA) in both themes; returns readable failures. */
async function scan(user: LocalMember, routes: string[]) {
  const failures: string[] = [];
  for (const theme of ["light", "dark"]) {
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
      (value) => localStorage.setItem("rolefoundry.theme.v1", value),
      theme,
    );
    const page = await context.newPage();
    for (const route of routes) {
      await page.goto(`${stack.origin}${route}`);
      await page.locator("h1").first().waitFor();
      await page.waitForLoadState("networkidle");
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      for (const violation of result.violations)
        failures.push(
          `${route} [${theme}] ${violation.id}: ${violation.nodes
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

it("keeps signed-in member screens accessible in light and dark themes", async () => {
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
}, 120000);

it("keeps the administrator workspace accessible in light and dark themes", async () => {
  expect(await scan(admin, ["/admin/"])).toEqual([]);
}, 120000);
