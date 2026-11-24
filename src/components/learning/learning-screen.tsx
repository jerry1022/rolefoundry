"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PageHeading } from "../ui/page-heading";
import { ApplicationError } from "@/modules/platform/errors";
import { useI18n } from "@/lib/i18n";
import type { CourseClient, LearningClient, LearningAdminClient } from "@/modules/learning/ports";
import type {
  CourseProgress,
  CoursePage,
  LearningPlan,
  PlanRequest,
  planHistorySchema,
} from "@/modules/learning/model";
import type { CatalogClient } from "@/modules/jobs/ports";
import type { PublishedJob, CatalogPage } from "@/modules/jobs/model";
import type { ProfileClient } from "@/modules/profile/ports";
import type { SkillClient } from "@/modules/skills/ports";
import type { z } from "zod";
import { acceptLearningRead } from "@/modules/learning/plan-state";
import { CourseCatalog } from "./course-catalog";
import { LearningPlanView } from "./plan-view";
import { CourseAdministration } from "./admin-bank";
export function LearningWorkspaceScreen({
  courses,
  client,
  adminClient,
  catalog,
  profile,
  skills,
  isAdmin,
  privateEnabled,
}: {
  courses: CourseClient;
  client: LearningClient;
  adminClient: LearningAdminClient;
  catalog: CatalogClient;
  profile: ProfileClient;
  skills: SkillClient;
  isAdmin: () => Promise<boolean>;
  privateEnabled: boolean;
}) {
  const { t } = useI18n();
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [progress, setProgress] = useState<CourseProgress | null>(null),
    [history, setHistory] = useState<z.infer<typeof planHistorySchema> | null>(null),
    [active, setActive] = useState<LearningPlan | null>(null),
    [jobs, setJobs] = useState<CatalogPage | null>(null),
    [target, setTarget] = useState<PublishedJob | null>(null),
    [resources, setResources] = useState<CoursePage | null>(null),
    [hours, setHours] = useState(5),
    [estimates, setEstimates] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [login, setLogin] = useState(false),
    [busy, setBusy] = useState(false),
    [admin, setAdmin] = useState(false),
    [polling, setPolling] = useState(true);
  const pending = useRef<{ payload: string; key: string } | null>(null),
    openEpoch = useRef(0),
    targetEpoch = useRef(0);
  function failed(error: unknown) {
    setError(
      error instanceof ApplicationError
        ? error.message
        : t("The learning workspace is temporarily unavailable."),
    );
    if (error instanceof ApplicationError && [401, 403].includes(error.status)) {
      setLogin(true);
      setActive(null);
      setProgress(null);
      setHistory(null);
    }
  }
  function locate(id: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("plan", id);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }
  function accept(next: LearningPlan) {
    setActive((current) => acceptLearningRead(current, next));
  }
  async function open(id: string) {
    const epoch = ++openEpoch.current;
    setError("");
    try {
      const next = await client.find(id);
      if (epoch !== openEpoch.current) return;
      accept(next);
      setPolling(true);
      locate(id);
    } catch (error) {
      if (epoch === openEpoch.current) failed(error);
    }
  }
  useEffect(() => {
    let present = true;
    if (!privateEnabled)
      return () => {
        present = false;
      };
    void Promise.all([client.progress(), client.list(), profile.read()])
      .then(([progress, history, preferences]) => {
        if (present) {
          setProgress(progress);
          setHistory(history);
          setHours(preferences.weeklyHours);
        }
      })
      .catch((error) => {
        if (present) failed(error);
      });
    void Promise.all([catalog.list({ q: "", limit: 20 }), courses.list({})])
      .then(([jobs, resources]) => {
        if (present) {
          setJobs(jobs);
          setResources(resources);
        }
      })
      .catch((error) => {
        if (present) failed(error);
      });
    void isAdmin()
      .then((value) => {
        if (present) setAdmin(value);
      })
      .catch(() => {});
    const params = new URL(window.location.href).searchParams,
      plan = params.get("plan"),
      job = params.get("job");
    if (plan)
      void client
        .find(plan)
        .then((next) => {
          if (present && openEpoch.current === 0) accept(next);
        })
        .catch((error) => {
          if (present) failed(error);
        });
    if (job)
      void catalog
        .find(job)
        .then((value) => {
          if (present && targetEpoch.current === 0) setTarget(value);
        })
        .catch((error) => {
          if (present) failed(error);
        });
    return () => {
      present = false;
    };
  }, [client, catalog, courses, profile, isAdmin, privateEnabled]);
  useEffect(() => {
    if (!active || !["queued", "running"].includes(active.status) || !polling) return;
    let present = true,
      count = 0,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await client.find(active.id);
        if (!present) return;
        setActive((current) =>
          current?.id === next.id ? acceptLearningRead(current, next) : current,
        );
        count++;
        if (["queued", "running"].includes(next.status) && count < 60)
          timer = setTimeout(() => void poll(), 1000);
        else setPolling(false);
      } catch (error) {
        if (present) {
          failed(error);
          setPolling(false);
        }
      }
    };
    timer = setTimeout(() => void poll(), 1000);
    return () => {
      present = false;
      clearTimeout(timer);
    };
  }, [active?.id, active?.status, polling, client]);
  useEffect(() => {
    if (!active) return;
    const id = active.id;
    const refresh = () =>
      void client
        .find(id)
        .then((next) =>
          setActive((current) =>
            current?.id === id ? acceptLearningRead(current, next) : current,
          ),
        )
        .catch(failed);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [active?.id, client]);
  useEffect(() => {
    if (active)
      setHistory((current) =>
        current
          ? {
              ...current,
              data: current.data.map((item) =>
                item.id === active.id ? { ...item, status: active.status } : item,
              ),
            }
          : current,
      );
  }, [active?.id, active?.status]);
  async function start() {
    if (!target) return;
    setBusy(true);
    setError("");
    const input: PlanRequest = {
      jobId: target.id,
      weeklyHours: hours,
      durationOverrides: Object.entries(estimates)
        .filter(([, value]) => value !== "")
        .map(([courseId, minutes]) => ({ courseId, minutes: Number(minutes) })),
    };
    const payload = JSON.stringify(input);
    if (pending.current?.payload !== payload)
      pending.current = { payload, key: crypto.randomUUID() };
    try {
      const result = await client.start(input, pending.current.key);
      pending.current = null;
      locate(result.planId);
      await open(result.planId);
      setHistory(await client.list());
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  }
  async function mutate(work: () => Promise<LearningPlan>) {
    setBusy(true);
    setError("");
    try {
      accept(await work());
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  }
  async function courseProgress(id: string, completed: boolean) {
    if (!progress) return;
    setBusy(true);
    setError("");
    try {
      const next = await client.courseProgress(id, progress.revision, completed);
      setProgress((current) => (!current || next.revision >= current.revision ? next : current));
      if (active) accept(await client.find(active.id));
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow={t("REVIEWED RESOURCES · PRIVATE PROGRESS")}
        title={t("Turn a useful gap into a learning step.")}
        description={t(
          "Explore curated course metadata, plan two manageable weeks and keep your own practice references. Learning progress stays separate from capability evidence.",
        )}
      />
      {!privateEnabled && (
        <p className="panel">
          {t(
            "Private plans and progress are not enabled on this deployment. You can still browse the reviewed resources.",
          )}
        </p>
      )}
      {error && (
        <div className="notice" role="alert">
          <p>{error}</p>
          {login ? (
            <Link className="button secondary" href="/account/">
              {t("Open account and privacy")}
            </Link>
          ) : (
            <button className="button secondary" onClick={() => window.location.reload()}>
              {t("Reload learning workspace")}
            </button>
          )}
        </div>
      )}
      <CourseCatalog
        client={courses}
        version={catalogVersion}
        privateEnabled={privateEnabled}
        skills={skills}
        progress={progress}
        busy={busy}
        onProgress={(id, completed) => void courseProgress(id, completed)}
      />
      {!login && progress && history && jobs && (
        <section className="panel section-block">
          <h2>{t("Plan the next two weeks")}</h2>
          <p className="muted">
            {t(
              "Choose a target role. Planning reads fresh job and evidence versions; it does not require a previous assessment or matching report.",
            )}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void start();
            }}
          >
            <fieldset className="profile-form-fields" disabled={busy}>
              <label>
                {t("Target role")}
                <select
                  aria-label={t("Learning target role")}
                  className="text-input"
                  value={target?.id || ""}
                  required
                  onChange={(event) => {
                    const id = event.target.value,
                      epoch = ++targetEpoch.current;
                    if (!id) {
                      setTarget(null);
                      return;
                    }
                    setBusy(true);
                    void catalog
                      .find(id)
                      .then((job) => {
                        if (epoch === targetEpoch.current) setTarget(job);
                      })
                      .catch(failed)
                      .finally(() => {
                        if (epoch === targetEpoch.current) setBusy(false);
                      });
                  }}
                >
                  <option value="">{t("Choose a published role")}</option>
                  {target && !jobs.data.some((job) => job.id === target.id) && (
                    <option value={target.id}>
                      {target.title} · {target.company}
                    </option>
                  )}
                  {jobs.data.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.title} · {job.company}
                    </option>
                  ))}
                </select>
              </label>
              {jobs.nextCursor && (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    setBusy(true);
                    void catalog
                      .list({ q: "", limit: 20, cursor: jobs.nextCursor! })
                      .then((next) => setJobs({ ...next, data: [...jobs.data, ...next.data] }))
                      .catch(failed)
                      .finally(() => setBusy(false));
                  }}
                >
                  {t("Load more learning target roles")}
                </button>
              )}
              <label>
                {t("Weekly learning hours")}
                <input
                  aria-label={t("Weekly learning hours")}
                  className="text-input"
                  type="number"
                  min={0}
                  max={80}
                  step="any"
                  required
                  value={hours}
                  onChange={(event) => setHours(event.target.valueAsNumber)}
                />
              </label>
              <details>
                <summary>{t("Adjust planning estimates to your pace")}</summary>
                <p className="muted">
                  {t(
                    "Official and editorial durations remain visible in the catalog. These optional estimates affect only your new plan and do not confirm completion.",
                  )}
                </p>
                {resources?.data.map((course) => (
                  <label key={course.id}>
                    {t("{title} · your estimated study minutes", { title: course.title })}
                    <input
                      aria-label={t("Planning minutes for {title}", { title: course.title })}
                      className="text-input"
                      type="number"
                      min={1}
                      max={50000}
                      value={estimates[course.id] || ""}
                      onChange={(event) =>
                        setEstimates({ ...estimates, [course.id]: event.target.value })
                      }
                    />
                  </label>
                ))}
                {resources?.nextCursor && (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => {
                      setBusy(true);
                      void courses
                        .list({ cursor: resources.nextCursor! })
                        .then((next) =>
                          setResources({ ...next, data: [...resources.data, ...next.data] }),
                        )
                        .catch(failed)
                        .finally(() => setBusy(false));
                    }}
                  >
                    {t("Load more resource estimates")}
                  </button>
                )}
              </details>
              <button className="button primary" disabled={!target || busy}>
                {busy ? t("Creating plan…") : t("Create a two-week learning plan")}
              </button>
            </fieldset>
          </form>
          <p className="fine-print">
            {t(
              "This rule-based planner uses no external model or AI allowance. Missing coverage, unknown durations and unfinished foundations stay explicit.",
            )}
          </p>
        </section>
      )}
      {active && (
        <LearningPlanView
          key={active.id}
          plan={active}
          busy={busy}
          onCheck={() => void open(active.id)}
          onStep={(id, completed) =>
            void mutate(() =>
              client.stepProgress(active.id, id, active.progressRevision, completed),
            )
          }
          onPractice={(id, url, summary) =>
            void mutate(() =>
              client.practice(active.id, id, {
                expectedRevision: active.progressRevision,
                url,
                summary,
              }),
            )
          }
          onRemove={(id) =>
            void mutate(() => client.removePractice(active.id, id, active.progressRevision))
          }
        />
      )}
      {history && (
        <section className="section-block">
          <h2>{t("Your learning plan history")}</h2>
          {!history.data.length && <p className="muted">{t("No private plans yet.")}</p>}
          <div className="assessment-history">
            {history.data.map((plan) => (
              <article className="panel" key={plan.id}>
                <h3>{t("Two-week plan")}</h3>
                <p>
                  {plan.status} · {plan.createdAt.slice(0, 10)}
                </p>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void open(plan.id)}
                >
                  {t("Open learning plan")}
                </button>
              </article>
            ))}
          </div>
          {history.nextCursor && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void client
                  .list(history.nextCursor!)
                  .then((next) => setHistory({ ...next, data: [...history.data, ...next.data] }))
                  .catch(failed)
                  .finally(() => setBusy(false));
              }}
            >
              {t("Load more learning plan history")}
            </button>
          )}
        </section>
      )}
      {admin && (
        <CourseAdministration
          client={adminClient}
          skills={skills}
          onChanged={() => {
            setCatalogVersion((value) => value + 1);
            void courses.list({}).then(setResources).catch(failed);
            if (active) void client.find(active.id).then(accept).catch(failed);
          }}
        />
      )}
    </>
  );
}
