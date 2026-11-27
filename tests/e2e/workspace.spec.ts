import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { initialWorkspace } from "../../src/lib/domain";
import { careerPaths } from "../../src/lib/career-paths";

test("all original career paths remain browsable even without sample openings", async ({
  page,
}) => {
  await page.goto("/jobs/");
  const categories = page.getByRole("group", { name: "AI career specializations" });
  await expect(categories.getByRole("button")).toHaveCount(10);
  for (const path of careerPaths) {
    await categories.getByRole("button", { name: `${path.title}`, exact: false }).click();
    await expect(page.locator("#selected-career-heading")).toHaveText(path.title);
    await expect(
      page.getByRole("heading", { name: "Learning sequence", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Evidence to build", exact: true }),
    ).toBeVisible();
  }
  await categories.getByRole("button", { name: /MLOps & AI platform engineering/ }).click();
  await expect(page.locator(".job-card")).toHaveCount(0);
  await expect(page.locator(".career-guide")).toContainText("tested release rollback");
  await expect(page.locator(".empty-state")).toContainText("Its career guide stays available");
  await page.getByRole("button", { name: "All specializations", exact: true }).click();
  await expect(page.locator(".job-card")).toHaveCount(8);
});

test("specialization filters combine with other filters and reset together", async ({ page }) => {
  await page.goto("/jobs/");
  await page
    .getByRole("group", { name: "AI career specializations" })
    .getByRole("button", { name: /AI \/ LLM application engineering/ })
    .click();
  await page.getByLabel("Workplace", { exact: true }).selectOption("Remote");
  await expect(page.locator(".job-card")).toHaveCount(1);
  await expect(page.locator(".job-card")).toContainText("LLM Product Engineer");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.locator(".job-card")).toHaveCount(8);
  await expect(
    page.getByRole("button", { name: "All specializations", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Search jobs", { exact: true }).fill("資料科學家");
  await expect(page.locator(".job-card")).toHaveCount(1);
  await expect(page.locator(".job-card")).toContainText("AI Growth Analyst");
});

test("editing waits for hydration and restores the saved draft before accepting input", async ({
  page,
}) => {
  await page.addInitScript(
    (workspace) => {
      localStorage.setItem("rolefoundry.workspace.v1", JSON.stringify(workspace));
    },
    { ...initialWorkspace, resume: "Previously saved draft" },
  );
  await page.route(/\/_next\/.*\.js/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.continue();
  });
  await page.goto("/resume/", { waitUntil: "commit" });
  const editor = page.getByLabel("Resume draft");
  await expect(editor).toBeDisabled();
  await expect(editor).toBeEditable();
  await expect(editor).toHaveValue("Previously saved draft");
  await editor.fill("A clean replacement draft");
  await expect(editor).toHaveValue("A clean replacement draft");
});

test("all workspace routes render without client errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const route of [
    "/",
    "/jobs/",
    "/skills/",
    "/assessments/",
    "/matches/",
    "/learning/",
    "/resume/",
    "/applications/",
    "/admin/",
    "/architecture/",
    "/account/",
    "/dictionary/",
  ]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("filters jobs, persists bookmarks, and tracks a role without applying", async ({ page }) => {
  await page.goto("/jobs/");
  await page.getByRole("textbox", { name: "Search jobs" }).fill("Orbit");
  await expect(page.locator(".job-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Save AI Application Engineer", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Saved only" }).click();
  await expect(page.locator(".job-card")).toHaveCount(1);
  await page.getByRole("button", { name: "AI Application Engineer", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Add to tracker" }).click();
  await page.getByRole("button", { name: "Close details" }).click();
  await page.goto("/applications/");
  await expect(page.locator(".application-card")).toHaveCount(1);
  await expect(page.getByLabel("Stage for AI Application Engineer")).toHaveValue("Saved");
  await page.getByLabel("Stage for AI Application Engineer").selectOption("Interview");
  await page.getByLabel("Note for AI Application Engineer").fill("Prepare a project walkthrough");
  await page.reload();
  await expect(page.getByLabel("Note for AI Application Engineer")).toHaveValue(
    "Prepare a project walkthrough",
  );
  await expect(page.getByLabel("Stage for AI Application Engineer")).toHaveValue("Interview");
});

test("assessment saves scenario evidence, not verified mastery", async ({ page }) => {
  await page.goto("/assessments/");
  await expect(page.getByRole("button", { name: "See my starting point" })).toBeDisabled();
  await page.getByRole("radio").nth(1).check();
  await page.getByRole("radio").nth(5).check();
  await page.getByRole("radio").nth(6).check();
  await page.getByRole("button", { name: "See my starting point" }).click();
  await expect(page.getByRole("heading", { name: "3 of 3 scenarios" })).toBeVisible();
  await page.goto("/skills/");
  await expect(page.locator(".evidence-item")).toHaveCount(3);
  await expect(page.locator(".evidence-item").first()).toContainText("Correct in a short scenario");
});

test("learning completion is persistent and does not add skill evidence", async ({ page }) => {
  await page.goto("/learning/");
  await page.getByRole("button", { name: "Mark complete" }).first().click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Completed", exact: true })).toHaveCount(1);
  await page.goto("/skills/");
  await expect(page.locator(".evidence-item")).toHaveCount(0);
  await page.getByLabel("First name").fill("Taylor");
  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("Good things ahead, Taylor.");
});

test("resume edits persist, checklist works, and text export contains the draft", async ({
  page,
}) => {
  await page.goto("/resume/");
  const draft = "Taylor\nBuilt a Python reporting tool with SQL.";
  await page.getByLabel("Resume draft").fill(draft);
  await page.getByRole("button", { name: "Review my draft" }).click();
  await expect(page.getByRole("heading", { name: "Your review checklist" })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export text" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("rolefoundry-resume.txt");
  expect(await readFile((await download.path())!, "utf8")).toBe(draft);
  await page.reload();
  await expect(page.getByLabel("Resume draft")).toHaveValue(draft);
});

test("reset clears local changes only after confirmation", async ({ page }) => {
  await page.goto("/skills/");
  await page.getByLabel("First name").fill("Changed");
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Reset demo" }).click();
  await page.getByRole("button", { name: "Keep my changes" }).click();
  await page.goto("/");
  await expect(page.locator("h1")).toContainText("Changed");
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Reset demo" }).click();
  await page.getByRole("button", { name: "Reset local demo", exact: true }).click();
  await page.goto("/");
  await expect(page.locator("h1")).toContainText("Alex");
});

test("mobile routes fit the viewport and navigation works", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "/",
    "/jobs/",
    "/skills/",
    "/assessments/",
    "/matches/",
    "/learning/",
    "/resume/",
    "/applications/",
    "/architecture/",
    "/account/",
    "/dictionary/",
  ]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Discover roles", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("Find your kind of next.");
});

test("public demo labels identity as unavailable and fails closed", async ({ page, request }) => {
  await page.goto("/account/");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveCount(0);
  const response = await request.get("/api/v1/identity/session");
  expect(response.status()).toBe(503);
  expect((await request.get("/api/v1/profile")).status()).toBe(503);
  expect((await request.get("/api/v1/evidence")).status()).toBe(503);
  expect((await request.get("/api/v1/jobs")).status()).toBe(503);
  expect((await request.get("/api/v1/bookmarks")).status()).toBe(503);
  expect((await request.get("/api/v1/skills")).status()).toBe(503);
  expect((await request.get("/api/v1/assessments")).status()).toBe(503);
  expect((await request.get("/api/v1/matches")).status()).toBe(503);
  expect((await request.get("/api/v1/courses")).status()).toBe(503);
  expect((await request.get("/api/v1/learning-plans")).status()).toBe(503);
  expect((await request.get("/api/v1/learning-progress")).status()).toBe(503);
  expect((await request.get("/api/v1/applications")).status()).toBe(503);
  const unavailableId = crypto.randomUUID();
  for (const [route, method] of [
    ["resumes", "GET"],
    [`resume-versions/${unavailableId}`, "GET"],
    [`resume-revisions/${unavailableId}`, "GET"],
    [`resume-exports/${unavailableId}/download-intents`, "POST"],
    [`resume-downloads/${unavailableId}`, "GET"],
  ]) {
    expect((await request.fetch(`/api/v1/${route}`, { method })).status()).toBe(503);
  }
  expect((await request.get("/api/v1/admin/assessments")).status()).toBe(503);
  expect((await request.get(`/api/v1/tasks/${crypto.randomUUID()}`)).status()).toBe(503);
});

test("Traditional Chinese persists across reloads, formats salaries and fits mobile", async ({
  page,
}) => {
  await page.goto("/jobs/");
  const language = page.getByRole("group", { name: "Language" });
  await language.getByRole("button", { name: /中文/ }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-TW");
  await expect(page.locator("h1")).toHaveText("找到屬於你的下一步。");
  await expect(page.locator(".job-card").first()).toContainText("NT$10萬–16萬 / 月");
  await expect(page.getByRole("link", { name: "探索職缺", exact: true })).toBeVisible();
  // Filters keep English values internally while showing translated labels.
  await page.getByRole("combobox", { name: "工作型態" }).selectOption({ label: "遠端" });
  await expect(page.locator(".job-card").first()).toContainText("遠端");

  await page.reload();
  await expect(page.locator("h1")).toHaveText("找到屬於你的下一步。");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "/",
    "/skills/",
    "/assessments/",
    "/learning/",
    "/resume/",
    "/applications/",
  ]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.getByRole("group", { name: "語言" }).getByRole("button", { name: /EN/ }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("h1")).toHaveText("Keep your possibilities moving.");
});

test("dark theme applies before paint, persists and follows the system setting", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  // System preference by default.
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const theme = page.getByRole("group", { name: "Color theme" });
  await theme.getByRole("button", { name: "Light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  // The stored choice is applied by the boot script on reload, overriding the OS setting.
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await theme.getByRole("button", { name: "Dark theme" }).click();
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).not.toBe("rgb(243, 245, 239)");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/jobs/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("demo routes meet WCAG 2.1 AA in light and dark themes and both languages", async ({
  browser,
}) => {
  test.setTimeout(180000);
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  const routes = [
    "/",
    "/jobs/",
    "/skills/",
    "/assessments/",
    "/matches/",
    "/learning/",
    "/resume/",
    "/applications/",
    "/architecture/",
    "/account/",
    "/dictionary/",
    "/admin/",
  ];
  const cases = [
    ...routes.map((route) => ({ route, theme: "light", locale: "en" })),
    ...routes.map((route) => ({ route, theme: "dark", locale: "en" })),
    ...["/", "/jobs/", "/learning/"].flatMap((route) => [
      { route, theme: "light", locale: "zh-TW" },
      { route, theme: "dark", locale: "zh-TW" },
    ]),
  ];
  const failures: string[] = [];
  for (const { route, theme, locale } of cases) {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    await context.addInitScript(
      ([t, l]) => {
        localStorage.setItem("rolefoundry.theme.v1", t);
        localStorage.setItem("rolefoundry.locale.v1", l);
      },
      [theme, locale],
    );
    const page = await context.newPage();
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    for (const violation of result.violations)
      failures.push(
        `${route} [${theme}/${locale}] ${violation.id}: ${violation.nodes
          .map((node) => node.target.join(" "))
          .slice(0, 3)
          .join(", ")}`,
      );
    await context.close();
  }
  expect(failures).toEqual([]);
});
