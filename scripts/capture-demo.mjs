import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

// Capture the actual running fixture-backed site; never a synthesized mockup.
await mkdir("docs/assets", { recursive: true });
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
    await page.goto(`http://127.0.0.1:3000${route}`);
    await page.locator("h1").waitFor();
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
  await page.goto("http://127.0.0.1:3000/");
  await page.screenshot({ path: "docs/assets/mobile.png", fullPage: true, animations: "disabled" });
} finally {
  await browser.close();
}
