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
import { taskKinds } from "@/modules/tasks/model";
import { ApplicationError } from "@/modules/platform/errors";
export function OperationsAdministration({
  client,
  isAdmin,
}: {
  client: OperationsClient;
  isAdmin: () => Promise<boolean>;
}) {
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
        : "Task diagnostics are temporarily unavailable.",
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
  return (
    <details
      className="panel section-block operations-workspace"
      aria-label="Task and worker diagnostics"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Task and worker diagnostics</summary>
      <p className="muted">
        Operational metadata only. Refresh on demand; displayed observations do not change task
        state.
      </p>
      {access === "checking" && <p role="status">Checking task diagnostics access…</p>}
      {access === "denied" && (
        <p>
          Task diagnostics require an administrator session.{" "}
          <Link href="/account/">Open account and privacy</Link>
        </p>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {access === "allowed" && (
        <>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void perform(refresh)}
          >
            Refresh task diagnostics
          </button>
          {busy && <p role="status">Loading task diagnostics…</p>}
          {summary && (
            <section className="section-block" aria-label="Task metrics">
              <h3>Queue and lease observations</h3>
              <p>
                Observed {summary.observedAt}. Physical deliveries: {summary.deliveryCount}. Invalid
                deliveries observed in 24 hours: {summary.poison24h}.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Task kind</th>
                      <th>Queued / ready</th>
                      <th>Running / expired lease</th>
                      <th>Oldest ready / heartbeat age (seconds)</th>
                      <th>Success / failure / retry events (24 hours)</th>
                      <th>Recent active workers</th>
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
              <h4>Diagnostic notices</h4>
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
                <p>No configured diagnostic thresholds were exceeded at this observation.</p>
              )}
              <p className="muted">
                Ready means the retry deadline has passed. Worker presence is self-reported and
                becomes stale after {summary.workerFreshSeconds} seconds; task leases remain
                authoritative. These notices do not send alerts to another service.
              </p>
            </section>
          )}
          <section className="section-block">
            <h3>Inspect tasks</h3>
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
                  Task kind
                  <select
                    className="text-input"
                    aria-label="Diagnostic task kind"
                    value={kind}
                    onChange={(event) => setKind(event.target.value)}
                  >
                    <option value="">All kinds</option>
                    {taskKinds.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Task state
                  <select
                    className="text-input"
                    aria-label="Diagnostic task state"
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                  >
                    <option value="">All states</option>
                    {["queued", "running", "succeeded", "failed"].map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="button secondary">Apply task filters</button>
              </fieldset>
            </form>
            <p>
              Applied filters: {query.kind || "all kinds"} / {query.status || "all states"}.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void perform(() => select(lookup));
              }}
            >
              <fieldset disabled={busy} className="profile-form-fields">
                <label>
                  Task identifier
                  <input
                    className="text-input"
                    aria-label="Diagnostic task identifier"
                    required
                    maxLength={36}
                    value={lookup}
                    onChange={(event) => setLookup(event.target.value)}
                  />
                </label>
                <button className="button secondary">Inspect task identifier</button>
              </fieldset>
            </form>
            {tasks?.data.length === 0 && <p>No tasks match these filters.</p>}
            {tasks?.data.map((item) => (
              <article key={item.id} className="panel section-block">
                <strong>
                  {item.kind} · {item.status}
                </strong>
                <p>
                  {item.id} · attempts {item.attempts}/{item.maxAttempts} ·{" "}
                  {item.errorCode || "no classified issue"}
                </p>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void perform(() => select(item.id))}
                >
                  Inspect task {item.id}
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
                Load older diagnostic tasks
              </button>
            )}
          </section>
          {task && (
            <section className="panel section-block" aria-label="Selected task diagnostics">
              <h3>Selected task diagnostics</h3>
              <p>
                {task.id} · {task.kind} · {task.status}
              </p>
              <dl>
                <dt>Attempts</dt>
                <dd>
                  {task.attempts}/{task.maxAttempts}
                </dd>
                <dt>Created / started</dt>
                <dd>
                  {task.createdAt} / {task.startedAt || "not started"}
                </dd>
                <dt>Retry due</dt>
                <dd>{task.nextRunAt}</dd>
                <dt>Lease expiry</dt>
                <dd>{task.leaseExpiresAt || "no active lease"}</dd>
                <dt>Latest task heartbeat</dt>
                <dd>{task.heartbeatAt || "none"}</dd>
                <dt>Result reference recorded</dt>
                <dd>{task.resultAvailable ? "yes" : "no"}</dd>
                <dt>Safe failure code</dt>
                <dd>{task.errorCode || "none"}</dd>
              </dl>
              <h4>Task event history</h4>
              {events?.data.length === 0 && <p>No retained events.</p>}
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
                  Load older task events
                </button>
              )}
              <p className="muted">
                Task replay requires a separate audited domain operation that revalidates owner and
                input versions.
              </p>
            </section>
          )}
          {workers && (
            <section className="section-block" aria-label="Worker observations">
              <h3>Worker observations</h3>
              <p>
                Observed {workers.observedAt}. Showing {workers.data.length} latest worker records
                {workers.truncated ? " (additional records are not shown)" : ""}.
              </p>
              {!workers.data.length && <p>No worker presence has been reported.</p>}
              {workers.data.map((worker) => (
                <article className="panel section-block" key={worker.id}>
                  <strong>{worker.observedState}</strong>
                  <p>{worker.id}</p>
                  <p>
                    Reported {worker.reportedState} · last seen {worker.lastSeenAt} · concurrency{" "}
                    {worker.concurrency} · lease {worker.leaseSeconds}s
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
