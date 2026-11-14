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
    "/learning/",
    "/resume/",
    "/applications/",
    "/admin/",
    "/architecture/",
    "/account/",
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
    "/learning/",
    "/resume/",
    "/applications/",
    "/architecture/",
    "/account/",
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
});
