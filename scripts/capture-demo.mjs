import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

// Capture the actual running fixture-backed site; never a synthesized mockup.
await mkdir("docs/assets", { recursive: true });
const baseURL = process.env.ROLEFOUNDRY_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  });
  for (const [route, name] of [
    ["/", "dashboard"],
    ["/jobs/", "jobs"],
    ["/learning/", "learning"],
  ]) {
    await page.goto(`${baseURL}${route}`);
    await page.locator("h1").waitFor();
    await page
      .locator("main")
      .getAttribute("aria-busy")
      .then(async (value) => {
        if (value === "true")
          await page.waitForFunction(
            () => document.querySelector("main")?.getAttribute("aria-busy") === "false",
          );
      });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `docs/assets/${name}.png`,
      fullPage: true,
      animations: "disabled",
    });
    console.log(
      `${route}: overflow=${await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)}`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseURL}/`);
  await page.screenshot({ path: "docs/assets/mobile.png", fullPage: true, animations: "disabled" });
  // Dark theme in Traditional Chinese, the first viewport only, for the README showcase.
  const localized = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await localized.addInitScript(() => {
    localStorage.setItem("rolefoundry.theme.v1", "dark");
    localStorage.setItem("rolefoundry.locale.v1", "zh-TW");
  });
  await localized.goto(`${baseURL}/jobs/`);
  await localized.locator('html[lang="zh-TW"]').waitFor();
  await localized.evaluate(() => document.fonts.ready);
  await localized.screenshot({ path: "docs/assets/jobs-zh-dark.png", animations: "disabled" });
} finally {
  await browser.close();
}
