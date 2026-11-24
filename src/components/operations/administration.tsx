"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { OperationsClient } from "@/modules/operations/ports";
import type {
  OperationsSummary,
  OperationsTaskPage,
  OperationsTask,
  OperationsWorkers,
  OperationsEventPage,
  OperationsQuery,
} from "@/modules/operations/model";
import { operationsAlerts } from "@/modules/operations/model";
import { TaskReplayControl } from "./replay-control";
import type { TaskReplayClient } from "@/modules/operations/replay";
import { taskKinds } from "@/modules/tasks/model";
import { ApplicationError } from "@/modules/platform/errors";
import { msg, useI18n } from "@/lib/i18n";
export function OperationsAdministration({
  client,
  isAdmin,
  replayClient,
}: {
  client: OperationsClient;
  isAdmin: () => Promise<boolean>;
  replayClient?: TaskReplayClient;
}) {
  const { t } = useI18n();
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking"),
    [open, setOpen] = useState(false),
    [summary, setSummary] = useState<OperationsSummary | null>(null),
    [workers, setWorkers] = useState<OperationsWorkers | null>(null),
    [tasks, setTasks] = useState<OperationsTaskPage | null>(null),
    [task, setTask] = useState<OperationsTask | null>(null),
    [events, setEvents] = useState<OperationsEventPage | null>(null),
    [kind, setKind] = useState(""),
    [status, setStatus] = useState("failed"),
    [query, setQuery] = useState<OperationsQuery>({ status: "failed" }),
    [lookup, setLookup] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false),
    generation = useRef(0),
    mounted = useRef(false);
  function failed(error: unknown) {
    setError(
      error instanceof ApplicationError
        ? error.message
        : msg("Task diagnostics are temporarily unavailable."),
    );
    if (error instanceof ApplicationError && [401, 403].includes(error.status)) {
      generation.current++;
      setAccess("denied");
      setSummary(null);
      setWorkers(null);
      setTasks(null);
      setTask(null);
      setEvents(null);
    }
    if (error instanceof ApplicationError && error.status === 404) {
      setTask(null);
      setEvents(null);
    }
  }
  async function perform(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (error) {
      failed(error);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function refresh() {
    const [nextSummary, nextWorkers, nextTasks] = await Promise.all([
      client.summary(),
      client.workers(),
      client.tasks(query),
    ]);
    setSummary(nextSummary);
    setWorkers(nextWorkers);
    setTasks(nextTasks);
    if (task) {
      const [nextTask, nextEvents] = await Promise.all([
        client.task(task.id),
        client.events(task.id),
      ]);
      setTask(nextTask);
      setEvents(nextEvents);
    }
  }
  useEffect(() => {
    let present = true;
    mounted.current = true;
    void isAdmin()
      .then((admin) => {
        if (present) setAccess(admin ? "allowed" : "denied");
      })
      .catch((error) => {
        if (present) failed(error);
      });
    return () => {
      present = false;
      mounted.current = false;
      generation.current++;
    };
  }, [isAdmin]);
  useEffect(() => {
    if (!open || access !== "allowed" || summary || lock.current) return;
    const current = generation.current;
    lock.current = true;
    setBusy(true);
    setError("");
    void Promise.all([client.summary(), client.workers(), client.tasks({ status: "failed" })])
      .then(([summary, workers, tasks]) => {
        if (mounted.current && generation.current === current) {
          setSummary(summary);
          setWorkers(workers);
          setTasks(tasks);
        }
      })
      .catch((error) => {
        if (mounted.current && generation.current === current) failed(error);
      })
      .finally(() => {
        lock.current = false;
        if (mounted.current) setBusy(false);
      });
  }, [client, open, access, summary]);
  async function select(id: string) {
    const [record, history] = await Promise.all([client.task(id), client.events(id)]);
    setTask(record);
    setEvents(history);
  }
  const attemptLimit = (item: OperationsTask) =>
    item.retryPolicy === "until-complete" ? t("persistent") : item.maxAttempts;
  return (
    <details
      className="panel section-block operations-workspace"
      aria-label={t("Task and worker diagnostics")}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>{t("Task and worker diagnostics")}</summary>
      <p className="muted">
        {t(
          "Operational metadata only. Refresh on demand; displayed observations do not change task state.",
        )}
      </p>
      {access === "checking" && <p role="status">{t("Checking task diagnostics access…")}</p>}
      {access === "denied" && (
        <p>
          {t("Task diagnostics require an administrator session.")}{" "}
          <Link href="/account/">{t("Open account and privacy")}</Link>
        </p>
      )}
      {error && (
        <p className="notice" role="alert">
          {t(error)}
        </p>
      )}
      {access === "allowed" && (
        <>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void perform(refresh)}
          >
            {t("Refresh task diagnostics")}
          </button>
          {busy && <p role="status">{t("Loading task diagnostics…")}</p>}
          {summary && (
            <section className="section-block" aria-label={t("Task metrics")}>
              <h3>{t("Queue and lease observations")}</h3>
              <p>
                {t(
                  "Observed {observedAt}. Physical deliveries: {deliveries}. Invalid deliveries observed in 24 hours: {invalid}.",
                  {
                    observedAt: summary.observedAt,
                    deliveries: summary.deliveryCount,
                    invalid: summary.poison24h,
                  },
                )}
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t("Task kind")}</th>
                      <th>{t("Queued / ready")}</th>
                      <th>{t("Running / expired lease")}</th>
                      <th>{t("Oldest ready / heartbeat age (seconds)")}</th>
                      <th>{t("Success / failure / retry events (24 hours)")}</th>
                      <th>{t("Recent active workers")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.kinds.map((item) => (
                      <tr key={item.kind}>
                        <th>{item.kind}</th>
                        <td>
                          {item.queued} / {item.ready}
                        </td>
                        <td>
                          {item.running} / {item.expiredLeases}
                        </td>
                        <td>
                          {item.oldestReadySeconds === null
                            ? "—"
                            : Math.floor(item.oldestReadySeconds)}{" "}
                          /{" "}
                          {item.maxLeaseAgeSeconds === null
                            ? "—"
                            : Math.floor(item.maxLeaseAgeSeconds)}
                        </td>
                        <td>
                          {item.succeeded24h} / {item.failed24h} / {item.retried24h}
                        </td>
                        <td>{item.activeWorkers}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h4>{t("Diagnostic notices")}</h4>
              {operationsAlerts(summary).length ? (
                <ul>
                  {operationsAlerts(summary).map((notice) => (
                    <li key={`${notice.kind}:${notice.code}`}>
                      {notice.kind ? `${notice.kind}: ` : ""}
                      {notice.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{t("No configured diagnostic thresholds were exceeded at this observation.")}</p>
              )}
              <p className="muted">
                {t(
                  "Ready means the retry deadline has passed. Worker presence is self-reported and becomes stale after {seconds} seconds; task leases remain authoritative. These notices do not send alerts to another service.",
                  { seconds: summary.workerFreshSeconds },
                )}
              </p>
            </section>
          )}
          <section className="section-block">
            <h3>{t("Inspect tasks")}</h3>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void perform(async () => {
                  const next: OperationsQuery = {
                    ...(kind ? { kind: kind as OperationsQuery["kind"] } : {}),
                    ...(status ? { status: status as OperationsQuery["status"] } : {}),
                  };
                  setTasks(await client.tasks(next));
                  setQuery(next);
                  setTask(null);
                  setEvents(null);
                });
              }}
            >
              <fieldset disabled={busy} className="profile-form-fields">
                <label>
                  {t("Task kind")}
                  <select
                    className="text-input"
                    aria-label={t("Diagnostic task kind")}
                    value={kind}
                    onChange={(event) => setKind(event.target.value)}
                  >
                    <option value="">{t("All kinds")}</option>
                    {taskKinds.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("Task state")}
                  <select
                    className="text-input"
                    aria-label={t("Diagnostic task state")}
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                  >
                    <option value="">{t("All states")}</option>
                    {["queued", "running", "succeeded", "failed"].map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="button secondary">{t("Apply task filters")}</button>
              </fieldset>
            </form>
            <p>
              {t("Applied filters: {kind} / {status}.", {
                kind: query.kind || t("all kinds"),
                status: query.status || t("all states"),
              })}
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void perform(() => select(lookup));
              }}
            >
              <fieldset disabled={busy} className="profile-form-fields">
                <label>
                  {t("Task identifier")}
                  <input
                    className="text-input"
                    aria-label={t("Diagnostic task identifier")}
                    required
                    maxLength={36}
                    value={lookup}
                    onChange={(event) => setLookup(event.target.value)}
                  />
                </label>
                <button className="button secondary">{t("Inspect task identifier")}</button>
              </fieldset>
            </form>
            {tasks?.data.length === 0 && <p>{t("No tasks match these filters.")}</p>}
            {tasks?.data.map((item) => (
              <article key={item.id} className="panel section-block">
                <strong>
                  {item.kind} · {item.status}
                </strong>
                <p>
                  {t("{id} · attempts {attempts}/{limit} · {issue}", {
                    id: item.id,
                    attempts: item.attempts,
                    limit: attemptLimit(item),
                    issue: item.errorCode || t("no classified issue"),
                  })}
                </p>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void perform(() => select(item.id))}
                >
                  {t("Inspect task {id}", { id: item.id })}
                </button>
              </article>
            ))}
            {tasks?.nextCursor && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    const next = await client.tasks({ ...query, cursor: tasks.nextCursor! });
                    setTasks({ ...next, data: [...tasks.data, ...next.data] });
                  })
                }
              >
                {t("Load older diagnostic tasks")}
              </button>
            )}
          </section>
          {task && (
            <section className="panel section-block" aria-label={t("Selected task diagnostics")}>
              <h3>{t("Selected task diagnostics")}</h3>
              <p>
                {task.id} · {task.kind} · {task.status}
              </p>
              <dl>
                <dt>{t("Attempts")}</dt>
                <dd>
                  {task.attempts}/{attemptLimit(task)}
                </dd>
                <dt>{t("Created / started")}</dt>
                <dd>
                  {task.createdAt} / {task.startedAt || t("not started")}
                </dd>
                <dt>{t("Retry due")}</dt>
                <dd>{task.nextRunAt}</dd>
                <dt>{t("Lease expiry")}</dt>
                <dd>{task.leaseExpiresAt || t("no active lease")}</dd>
                <dt>{t("Latest task heartbeat")}</dt>
                <dd>{task.heartbeatAt || t("none")}</dd>
                <dt>{t("Result reference recorded")}</dt>
                <dd>{task.resultAvailable ? t("yes") : t("no")}</dd>
                <dt>{t("Safe failure code")}</dt>
                <dd>{task.errorCode || t("none")}</dd>
              </dl>
              {replayClient && (
                <TaskReplayControl
                  key={task.id}
                  taskId={task.id}
                  client={replayClient}
                  onUnavailable={failed}
                  onInspect={(id) => void perform(() => select(id))}
                />
              )}
              <h4>{t("Task event history")}</h4>
              {events?.data.length === 0 && <p>{t("No retained events.")}</p>}
              <ul>
                {events?.data.map((event) => (
                  <li key={event.id}>
                    {event.createdAt} · {event.event}
                    {event.code ? ` · ${event.code}` : ""}
                  </li>
                ))}
              </ul>
              {events?.nextCursor && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      const next = await client.events(task.id, events.nextCursor!);
                      setEvents({ ...next, data: [...events.data, ...next.data] });
                    })
                  }
                >
                  {t("Load older task events")}
                </button>
              )}
              <p className="muted">
                {t(
                  "Task replay requires a separate audited domain operation that revalidates owner and input versions.",
                )}
              </p>
            </section>
          )}
          {workers && (
            <section className="section-block" aria-label={t("Worker observations")}>
              <h3>{t("Worker observations")}</h3>
              <p>
                {workers.truncated
                  ? t(
                      "Observed {observedAt}. Showing {count} latest worker records (additional records are not shown).",
                      { observedAt: workers.observedAt, count: workers.data.length },
                    )
                  : t("Observed {observedAt}. Showing {count} latest worker records.", {
                      observedAt: workers.observedAt,
                      count: workers.data.length,
                    })}
              </p>
              {!workers.data.length && <p>{t("No worker presence has been reported.")}</p>}
              {workers.data.map((worker) => (
                <article className="panel section-block" key={worker.id}>
                  <strong>{worker.observedState}</strong>
                  <p>{worker.id}</p>
                  <p>
                    {t(
                      "Reported {state} · last seen {lastSeenAt} · concurrency {concurrency} · lease {leaseSeconds}s",
                      {
                        state: worker.reportedState,
                        lastSeenAt: worker.lastSeenAt,
                        concurrency: worker.concurrency,
                        leaseSeconds: worker.leaseSeconds,
                      },
                    )}
                  </p>
                  <p>{worker.kinds.join(", ")}</p>
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </details>
  );
}
