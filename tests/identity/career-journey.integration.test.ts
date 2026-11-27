import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { chromium, expect as webExpect } from "@playwright/test";
import { CareerJourney } from "../support/career-journey";
import type { LocalMember } from "../support/local-fixtures";
import { attemptSchema, questionBankSchema } from "../../src/modules/assessment/model";
import { matchRunSchema } from "../../src/modules/matching/model";
import { planSchema, courseProgressSchema } from "../../src/modules/learning/model";
import { resumeDocumentSchema } from "../../src/modules/resume/model";
import { applicationSchema } from "../../src/modules/applications/model";
import { IsolatedResumeProcessor } from "../../src/modules/resume/adapters/isolated-process";
vi.mock("server-only", () => ({}));

let journey: CareerJourney, admin: LocalMember, owner: LocalMember, other: LocalMember;
let jobId: string, courseId: string, attemptId: string, runId: string, planId: string;
let documentId: string, versionId: string, applicationId: string, exportId: string;
let portfolioId: string, permitId: string;
const factText = "Completed a Python evaluation project with documented test results.";
beforeAll(async () => {
  journey = await CareerJourney.open();
  admin = await journey.stack.member(true);
  owner = await journey.stack.member();
  other = await journey.stack.member();
  jobId = await journey.publishJob(admin);
  courseId = await journey.publishCourse(admin);
  await journey.publishQuestions(admin);
});
afterAll(async () => {
  if (journey) await journey.close();
});

it("connects one verified owner through evidence, assessed matching, reviewed learning, confirmed PDF and manual tracking", async () => {
  const session = await journey.data("identity/session", owner);
  expect(session.userId).toBe(owner.id);
  const profile = await journey.data("profile", owner, "PATCH", {
    expectedRevision: 0,
    name: "Journey owner",
    track: "Engineering & data",
    workplaces: ["Remote"],
    weeklyHours: 2,
  });
  const portfolio = await journey.data(
    "evidence",
    owner,
    "POST",
    {
      expectedRevision: profile.revision,
      evidence: {
        source: "portfolio-reference",
        label: `${journey.prefix} private project`,
        context: "Independently authored evaluation notes; unreviewed external reference",
        observedAt: new Date(Date.now() - 60000).toISOString(),
        skills: ["python"],
        url: "https://portfolio.test.invalid/evaluation",
      },
    },
    201,
  );
  portfolioId = portfolio.evidence.id;
  const publicJob = await journey.data(`jobs/${jobId}`);
  expect(publicJob.id).toBe(jobId);
  expect((await journey.stack.request(`bookmarks/${jobId}`, owner, "PUT", {})).status).toBe(200);

  const attempt = attemptSchema.parse(
    await journey.data(
      "assessments",
      owner,
      "POST",
      {
        track: "Engineering & data",
      },
      201,
    ),
  );
  attemptId = attempt.id;
  const bank = questionBankSchema.parse(await journey.data("admin/assessments", admin));
  const answers = Object.fromEntries(
    attempt.items.map((item) => {
      const question = bank.questions.find((question) => question.id === item.questionVersionId);
      expect(question).toBeDefined();
      return [item.id, question!.correctIndex];
    }),
  );
  expect(attempt.items.some((item) => item.skillId === "python")).toBe(true);
  const submitted = await journey.data(
    `assessments/${attemptId}/submit`,
    owner,
    "POST",
    {
      expectedRevision: attempt.revision,
      answers,
    },
    202,
  );
  await journey.execute(submitted.taskId);
  const completed = attemptSchema.parse(await journey.data(`assessments/${attemptId}`, owner));
  expect(completed.status).toBe("completed");
  expect(completed.result!.correct).toBe(completed.items.length);

  const matchTask = await journey.data(
    "matches",
    owner,
    "POST",
    {
      jobId,
      constraints: { experienceYears: null, confirmations: [] },
    },
    202,
  );
  await journey.execute(matchTask.taskId);
  runId = matchTask.runId;
  const run = matchRunSchema.parse(await journey.data(`matches/${runId}`, owner));
  expect(run.stale).toBe(false);
  expect(run.data).toHaveLength(1);
  const python = run.data[0].requirements
    .flatMap((item) => item.skills)
    .find((skill) => skill.skillId === "python")!;
  expect(
    python.support.some(
      (reference) =>
        reference.source === "scenario" &&
        completed.result!.observations.some(
          (observation) => observation.evidenceId === reference.evidenceId,
        ),
    ),
  ).toBe(true);
  expect(
    python.support.some(
      (reference) => reference.evidenceId === portfolioId && reference.signal === "reference",
    ),
  ).toBe(true);
  expect(run.data[0].gaps.some((gap) => gap.skillId === "rag")).toBe(true);

  const learning = await journey.data(
    "learning-plans",
    owner,
    "POST",
    {
      jobId,
      weeklyHours: 2,
      durationOverrides: [],
    },
    202,
  );
  await journey.execute(learning.taskId);
  planId = learning.planId;
  const plan = planSchema.parse(await journey.data(`learning-plans/${planId}`, owner));
  const step = plan.steps.find((step) => step.courseId === courseId)!;
  expect(step).toBeDefined();
  expect(step.url).toBe(`https://www.deeplearning.ai/courses/${journey.prefix}/`);
  expect(step.available).toBe(true);
  const beforeLearning = await journey.data("profile", owner);
  const evidenceBefore = await journey.data("evidence", owner);
  const progress = courseProgressSchema.parse(await journey.data("learning-progress", owner));
  await journey.data(`learning-progress/courses/${courseId}`, owner, "PATCH", {
    expectedRevision: progress.revision,
    completed: true,
  });
  expect((await journey.data("profile", owner)).revision).toBe(beforeLearning.revision);
  expect(await journey.data("evidence", owner)).toEqual(evidenceBefore);

  const pasted = await journey.data("resumes/paste", owner, "POST", { text: factText }, 202);
  documentId = pasted.documentId;
  await journey.execute(pasted.taskId);
  const parsed = resumeDocumentSchema.parse(await journey.data(`resumes/${documentId}`, owner));
  expect(parsed.draft!.text).toBe(factText);
  expect(await journey.data("evidence", owner)).toEqual(evidenceBefore);
  const factId = crypto.randomUUID();
  const confirmed = resumeDocumentSchema.parse(
    await journey.data(`resumes/${documentId}/confirm`, owner, "POST", {
      expectedRevision: parsed.revision,
      content: {
        facts: [
          {
            id: factId,
            text: factText,
            kind: "project",
            state: "completed",
            skillIds: ["python"],
            sourceBlockId: parsed.draft!.blocks[0].id,
          },
        ],
        sections: [{ id: crypto.randomUUID(), heading: "Projects", factIds: [factId] }],
      },
    }),
  );
  versionId = confirmed.currentVersion!.id;
  expect((await journey.data(`matches/${runId}`, owner)).stale).toBe(true);
  expect((await journey.data(`learning-plans/${planId}`, owner)).stale).toBe(true);
  const claimRows = await journey.data("evidence", owner);
  const resumeClaims = claimRows.filter(
    (item: { source: string }) => item.source === "resume-claim",
  );
  expect(resumeClaims).toHaveLength(1);
  expect(resumeClaims[0].reviewState).toBe("unreviewed");

  const exported = await journey.data(
    `resumes/${documentId}/exports`,
    owner,
    "POST",
    { versionId },
    202,
  );
  exportId = exported.id;
  await journey.execute(exported.taskId);
  const permit = await journey.data(
    `resume-exports/${exportId}/download-intents`,
    owner,
    "POST",
    {},
    201,
  );
  permitId = permit.id;
  const file = await journey.stack.request(`resume-downloads/${permitId}`, owner);
  expect(file.status).toBe(200);
  expect(file.headers.get("content-type")).toBe("application/pdf");
  expect(file.headers.get("content-disposition")).toContain(versionId);
  const bytes = Buffer.from(await file.arrayBuffer());
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(bytes.length).toBeGreaterThan(1000);
  const exportedText = await new IsolatedResumeProcessor().parse(
    bytes,
    "application/pdf",
    AbortSignal.timeout(10000),
  );
  expect(exportedText.text.replace(/\s+/g, " ")).toContain(factText);

  let application = applicationSchema.parse(
    await journey.data("applications", owner, "POST", { jobId }, 201),
  );
  applicationId = application.id;
  expect(application.stage).toBe("Saved");
  application = applicationSchema.parse(
    await journey.data(`applications/${applicationId}`, owner, "PATCH", {
      expectedRevision: application.revision,
      stage: "Saved",
      note: `${journey.prefix} private preparation`,
      resumeVersionId: versionId,
      confirmationReference: null,
    }),
  );
  expect(application.resume!.id).toBe(versionId);
  // Exporting/opening/bookmarking remains preparation; only this explicit report changes stage.
  application = applicationSchema.parse(
    await journey.data(`applications/${applicationId}`, owner, "PATCH", {
      expectedRevision: application.revision,
      stage: "Applied",
      note: application.note,
      resumeVersionId: versionId,
      confirmationReference: "Owner-reported synthetic submission",
    }),
  );
  application = applicationSchema.parse(
    await journey.data(
      `applications/${applicationId}/follow-ups`,
      owner,
      "POST",
      {
        expectedRevision: application.revision,
        title: "Review my next step",
        dueAt: "2090-01-08T01:30:00Z",
      },
      201,
    ),
  );
  expect(application.stage).toBe("Applied");
  expect(application.followUps).toHaveLength(1);
  expect(
    (await journey.data(`applications/${applicationId}/events`, owner)).some(
      (event: { kind: string }) => event.kind === "stage",
    ),
  ).toBe(true);
}, 60000);

it("reloads the persisted journey in a fresh mobile browser and denies every foreign private reference", async () => {
  for (const path of [
    `assessments/${attemptId}`,
    `matches/${runId}`,
    `learning-plans/${planId}`,
    `resumes/${documentId}`,
    `resume-versions/${versionId}`,
    `applications/${applicationId}`,
    `resume-downloads/${permitId}`,
  ]) {
    expect((await journey.stack.request(path, other)).status, path).toBe(404);
    expect((await journey.stack.request(path)).status, path).toBe(401);
  }
  expect(
    (
      await journey.stack.request(`applications/${applicationId}`, other, "PATCH", {
        expectedRevision: 1,
        stage: "Offer",
        note: "forged",
        resumeVersionId: versionId,
        confirmationReference: null,
      })
    ).status,
  ).toBe(404);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      timezoneId: "Asia/Taipei",
    });
    page.setDefaultTimeout(8000);
    await page.context().addCookies(
      owner.cookie.split("; ").map((pair) => {
        const at = pair.indexOf("=");
        return { name: pair.slice(0, at), value: pair.slice(at + 1), url: journey.stack.origin };
      }),
    );
    await page.goto(`${journey.stack.origin}/account/`);
    await webExpect(
      page.getByRole("heading", { name: "Signed in as a member", exact: true }),
    ).toBeVisible();
    await page.goto(`${journey.stack.origin}/assessments/?attempt=${attemptId}`);
    await webExpect(page.getByText(/of \d+ scenarios/)).toBeVisible();
    await page.goto(`${journey.stack.origin}/matches/?run=${runId}`);
    await webExpect(
      page.getByRole("heading", { name: `${journey.prefix} AI engineer`, exact: true }),
    ).toBeVisible();
    await page.goto(`${journey.stack.origin}/learning/?plan=${planId}`);
    await webExpect(
      page.getByRole("heading", { name: "Your two-week learning plan", exact: true }),
    ).toBeVisible();
    await page.goto(`${journey.stack.origin}/resume/?document=${documentId}`);
    await webExpect(page.getByText(factText, { exact: true }).first()).toBeVisible();
    await page.goto(`${journey.stack.origin}/applications/?application=${applicationId}`);
    await webExpect(page.getByLabel("Application stage", { exact: true })).toHaveValue("Applied");
    await webExpect(page.getByLabel("Application note", { exact: true })).toHaveValue(
      `${journey.prefix} private preparation`,
    );
    await page.reload();
    await webExpect(page.getByLabel("Application stage", { exact: true })).toHaveValue("Applied");
    await webExpect(page.getByLabel("Application note", { exact: true })).toHaveValue(
      `${journey.prefix} private preparation`,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: ".local/career-journey-tracking-mobile.png",
      animations: "disabled",
    });
  } finally {
    await browser.close();
  }
}, 60000);

it("purges dependent analysis on evidence deletion and unlinks the confirmed resume without erasing independent tracking", async () => {
  const profile = await journey.data("profile", owner);
  const evidence = (await journey.data(`evidence/${portfolioId}`, owner))[0];
  await journey.data(`evidence/${portfolioId}`, owner, "DELETE", {
    expectedRevision: profile.revision,
    expectedVersion: evidence.version,
  });
  const run = matchRunSchema.parse(await journey.data(`matches/${runId}`, owner));
  expect(run.data).toEqual([]);
  expect(run.stale).toBe(true);
  const plan = planSchema.parse(await journey.data(`learning-plans/${planId}`, owner));
  expect(plan.status).toBe("invalidated");
  expect(plan.output).toBeNull();
  expect(plan.steps).toEqual([]);
  const resume = resumeDocumentSchema.parse(await journey.data(`resumes/${documentId}`, owner));
  await journey.data(`resumes/${documentId}`, owner, "DELETE", {
    expectedRevision: resume.revision,
  });
  expect((await journey.stack.request(`resume-versions/${versionId}`, owner)).status).toBe(404);
  expect((await journey.stack.request(`resume-downloads/${permitId}`, owner)).status).toBe(404);
  const application = applicationSchema.parse(
    await journey.data(`applications/${applicationId}`, owner),
  );
  expect(application.resume).toBeNull();
  expect(application.stage).toBe("Applied");
  expect(application.note).toBe(`${journey.prefix} private preparation`);
  expect(application.followUps[0].title).toBe("Review my next step");
  expect(
    (await journey.data(`applications/${applicationId}/events`, owner)).some(
      (event: { kind: string }) => event.kind === "resume-removed",
    ),
  ).toBe(true);
});
