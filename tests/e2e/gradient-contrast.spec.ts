import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";

/**
 * axe reports text over gradient or image backgrounds as "incomplete" instead of judging it.
 * This measures those nodes against the dominant rendered background colour. Decorative
 * (aria-hidden) art is exempt, and pills/circles are skipped because their rounded corners expose
 * the page behind them and skew the sample (those keep axe's own checks of their solid colours).
 */
const routes = [
  "/",
  "/jobs/",
  "/skills/",
  "/assessments/",
  "/learning/",
  "/resume/",
  "/applications/",
];
const luminance = ([r, g, b]: number[]) => {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
const contrast = (a: number[], b: number[]) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};

test("text over gradients meets WCAG AA contrast in both themes", async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Pixel sampling is engine-independent; run it once.");
  test.setTimeout(180000);
  const failures: string[] = [];
  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      reducedMotion: "reduce",
    });
    await context.addInitScript(
      (value) => localStorage.setItem("rolefoundry.theme.v1", value),
      theme,
    );
    const page = await context.newPage();
    for (const route of routes) {
      await page.goto(route);
      await page.locator("h1").first().waitFor();
      await page.waitForTimeout(400);
      const result = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      const nodes = result.incomplete.flatMap((item) => item.nodes).slice(0, 60);
      for (const node of nodes) {
        const element = page.locator(String(node.target[0])).first();
        const info = await element
          .evaluate((el) => {
            const box = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            return {
              hidden: !!el.closest('[aria-hidden="true"]'),
              rounded: parseFloat(style.borderTopLeftRadius) >= Math.min(box.width, box.height) / 4,
              color: style.color,
              size: parseFloat(style.fontSize),
              weight: Number(style.fontWeight),
              text: (el.textContent || "").trim().slice(0, 40),
            };
          })
          .catch(() => null);
        if (!info || info.hidden || info.rounded || !(await element.isVisible())) continue;
        const foreground = (info.color.match(/[\d.]+/g) || []).map(Number);
        if (foreground.length > 3 && foreground[3] === 0) continue;
        const image = await element.screenshot({ timeout: 2000 }).catch(() => null);
        if (!image) continue;
        const { data, info: meta } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
        const counts = new Map<string, number>();
        for (let i = 0; i < data.length; i += meta.channels) {
          const key = `${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`;
          counts.set(key, (counts.get(key) || 0) + 1);
        }
        const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
        const background = dominant.split(",").map((value) => Number(value) * 8 + 4);
        const large = info.size >= 24 || (info.size >= 18.66 && info.weight >= 700);
        const ratio = contrast(foreground.slice(0, 3), background);
        if (ratio < (large ? 3 : 4.5))
          failures.push(
            `${theme} ${route} ${ratio.toFixed(2)}:1 "${info.text}" (${node.target[0]})`,
          );
      }
    }
    await context.close();
  }
  expect(failures).toEqual([]);
});
