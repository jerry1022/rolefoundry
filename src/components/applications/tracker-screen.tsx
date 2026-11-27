"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PageHeading } from "../ui/page-heading";
import { ApplicationError } from "@/modules/platform/errors";
import { uuid } from "@/modules/applications/model";
import type { Application, ResumeChoicePage } from "@/modules/applications/model";
import type { ApplicationClient } from "@/modules/applications/ports";
import type { CatalogClient } from "@/modules/jobs/ports";
import type { PublishedJob } from "@/modules/jobs/model";
import { mergeApplication, mergeApplications } from "@/modules/applications/record-state";
import { ApplicationEditor } from "./application-editor";
import { FollowUps } from "./follow-ups";
import { EventHistory } from "./event-history";
type Props = { client: ApplicationClient; catalog: CatalogClient; catalogEnabled: boolean };
export function ApplicationTrackerScreen({ client, catalog, catalogEnabled }: Props) {
  const [records, setRecords] = useState<Application[]>([]),
    [record, setRecord] = useState<Application | null>(null),
    [cursor, setCursor] = useState<string | null>(null),
    [choices, setChoices] = useState<ResumeChoicePage>({ data: [], nextCursor: null }),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [privateReady, setPrivateReady] = useState(false),
    [jobs, setJobs] = useState<PublishedJob[]>([]),
    [jobCursor, setJobCursor] = useState<string | null>(null),
    [jobId, setJobId] = useState(""),
    [removeConfirm, setRemoveConfirm] = useState(false),
    [notice, setNotice] = useState("");
  const activeId = useRef<string | null>(null),
    currentOwner = useRef<string | null>(null),
    deleted = useRef(new Set<string>()),
    epoch = useRef(0),
    live = useRef(true),
    mutationBusy = useRef(false),
    keys = useRef(new Map<string, string>());
  const failed = useCallback((problem: unknown) => {
    if (!live.current) return;
    if (problem instanceof ApplicationError && [401, 403].includes(problem.status)) {
      epoch.current++;
      activeId.current = null;
      setRecord(null);
      setRecords([]);
      setChoices({ data: [], nextCursor: null });
      setPrivateReady(false);
    }
    setError(
      problem instanceof ApplicationError
        ? problem.message
        : "The tracker is temporarily unavailable. Retry without changing your draft.",
    );
  }, []);
  const accept = useCallback(
    (value: Application, select = false) => {
      if (!live.current || deleted.current.has(value.id)) return;
      if (currentOwner.current !== value.ownerId) {
        failed(
          new ApplicationError(
            "RF_UNAUTHORIZED",
            401,
            "Your account changed. Refresh the private tracker.",
          ),
        );
        return;
      }
      setRecords((current) => mergeApplications(current, [value], deleted.current));
      if (select) {
        activeId.current = value.id;
        const url = new URL(location.href);
        url.searchParams.set("application", value.id);
        history.replaceState(null, "", url);
        setRemoveConfirm(false);
        setRecord(value);
      } else if (activeId.current === value.id)
        setRecord((current) => mergeApplication(current, value));
    },
    [failed],
  );
  const load = useCallback(async () => {
    if (mutationBusy.current) return;
    const generation = ++epoch.current;
    try {
      const page = await client.list();
      if (!live.current || generation !== epoch.current) return;
      if (currentOwner.current && currentOwner.current !== page.ownerId) {
        activeId.current = null;
        setRecord(null);
        setRecords([]);
        setChoices({ data: [], nextCursor: null });
        keys.current.clear();
        deleted.current.clear();
      }
      currentOwner.current = page.ownerId;
      setRecords((current) =>
        mergeApplications(
          page.data,
          current.filter((item) => item.id === activeId.current),
          deleted.current,
        ),
      );
      setCursor(page.nextCursor);
      setPrivateReady(true);
      setError("");
      if (activeId.current) {
        const id = activeId.current;
        try {
          const value = await client.find(id);
          if (generation === epoch.current && activeId.current === id) accept(value);
        } catch (problem) {
          if (
            problem instanceof ApplicationError &&
            problem.status === 404 &&
            generation === epoch.current
          ) {
            deleted.current.add(id);
            activeId.current = null;
            setRecord(null);
            setRecords((current) => current.filter((item) => item.id !== id));
          } else throw problem;
        }
      }
      const references = await client.resumeChoices();
      if (generation === epoch.current && live.current) setChoices(references);
    } catch (problem) {
      if (generation === epoch.current) failed(problem);
    } finally {
      if (live.current) setLoading(false);
    }
  }, [client, accept, failed]);
  useEffect(() => {
    live.current = true;
    const selection = uuid.safeParse(new URLSearchParams(location.search).get("application"));
    if (selection.success) activeId.current = selection.data;
    void load();
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => {
      live.current = false;
      epoch.current++;
      window.removeEventListener("focus", focus);
    };
  }, [load]);
  useEffect(() => {
    if (!catalogEnabled) return;
    let active = true;
    const query = new URLSearchParams(location.search),
      id = uuid.safeParse(query.get("job"));
    Promise.all([
      catalog.list({ q: "", limit: 20 }),
      id.success ? catalog.find(id.data) : Promise.resolve(null),
    ])
      .then(([page, target]) => {
        if (active) {
          setJobs([
            ...new Map(
              [...(target ? [target] : []), ...page.data].map((item) => [item.id, item]),
            ).values(),
          ]);
          setJobCursor(page.nextCursor);
          setJobId(target?.id ?? page.data[0]?.id ?? "");
        }
      })
      .catch(() => {
        if (active)
          setNotice(
            "Published roles could not be loaded. Existing tracker records remain available.",
          );
      });
    return () => {
      active = false;
    };
  }, [catalog, catalogEnabled]);
  async function mutate(work: () => Promise<Application>, operation?: string) {
    if (mutationBusy.current) return false;
    mutationBusy.current = true;
    const generation = ++epoch.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const value = await work();
      if (!live.current || generation !== epoch.current) return false;
      accept(value, true);
      if (operation) keys.current.delete(operation);
      return true;
    } catch (problem) {
      failed(problem);
      return false;
    } finally {
      mutationBusy.current = false;
      if (live.current) setBusy(false);
    }
  }
  function requestKey(operation: string) {
    if (!keys.current.has(operation)) keys.current.set(operation, crypto.randomUUID());
    return keys.current.get(operation)!;
  }
  async function select(id: string) {
    if (busy) return;
    const generation = ++epoch.current;
    setError("");
    setRemoveConfirm(false);
    try {
      const value = await client.find(id);
      if (generation === epoch.current) accept(value, true);
    } catch (problem) {
      failed(problem);
    }
  }
  async function moreRecords() {
    if (!cursor || busy) return;
    const generation = epoch.current;
    setBusy(true);
    try {
      const page = await client.list(cursor);
      if (!live.current || generation !== epoch.current) return;
      if (page.ownerId !== currentOwner.current) {
        failed(
          new ApplicationError(
            "RF_UNAUTHORIZED",
            401,
            "Your account changed. Refresh the private tracker.",
          ),
        );
        return;
      }
      setRecords((current) => mergeApplications(current, page.data, deleted.current));
      setCursor(page.nextCursor);
    } catch (problem) {
      failed(problem);
    } finally {
      setBusy(false);
    }
  }
  async function moreResumes() {
    if (!choices.nextCursor || busy) return;
    const generation = epoch.current;
    setBusy(true);
    try {
      const page = await client.resumeChoices(choices.nextCursor);
      if (!live.current || generation !== epoch.current) return;
      setChoices((current) => ({
        data: [...new Map([...current.data, ...page.data].map((item) => [item.id, item])).values()],
        nextCursor: page.nextCursor,
      }));
    } catch (problem) {
      failed(problem);
    } finally {
      setBusy(false);
    }
  }
  async function moreJobs() {
    if (!jobCursor || busy) return;
    setBusy(true);
    try {
      const page = await catalog.list({ q: "", limit: 20, cursor: jobCursor });
      setJobs((current) => [
        ...new Map([...current, ...page.data].map((item) => [item.id, item])).values(),
      ]);
      setJobCursor(page.nextCursor);
    } catch {
      setNotice("Reload published roles if the catalog changed.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!record || mutationBusy.current) return;
    mutationBusy.current = true;
    epoch.current++;
    setBusy(true);
    try {
      await client.remove(record.id, record.revision);
      deleted.current.add(record.id);
      setRecords((current) => current.filter((item) => item.id !== record.id));
      setRecord(null);
      activeId.current = null;
      const url = new URL(location.href);
      url.searchParams.delete("application");
      history.replaceState(null, "", url);
      setRemoveConfirm(false);
      setNotice("The record, event history and follow-ups were deleted.");
    } catch (problem) {
      failed(problem);
    } finally {
      mutationBusy.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="PRIVATE · MANUAL PROGRESS"
        title="Keep your possibilities moving."
        description="Track preparation, your reported applications and the next action. Visiting a source never changes a stage."
      />
      {error && (
        <div role="alert" className="notice">
          {error}{" "}
          <button className="button secondary" disabled={busy} onClick={() => void load()}>
            Refresh private tracker
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {loading && <p role="status">Loading private tracker…</p>}
      {!loading && !privateReady && (
        <section className="panel">
          <h2>Sign in for your private tracker</h2>
          <p>Your browser-local demo is not uploaded automatically.</p>
          <Link className="button primary" href="/account/">
            Account and sign in
          </Link>
        </section>
      )}
      {privateReady && (
        <>
          <section className="panel application-add">
            <h2>Track a published role</h2>
            <p className="muted">
              This records preparation as Saved. A closed cycle stays closed until you explicitly
              create a new one.
            </p>
            <label>
              Published role
              <select
                aria-label="Role to track"
                disabled={busy || !jobs.length}
                value={jobId}
                onChange={(event) => setJobId(event.target.value)}
              >
                {!jobs.length && <option value="">No published roles available</option>}
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title} · {job.company}
                  </option>
                ))}
              </select>
            </label>
            {jobCursor && (
              <button className="button secondary" disabled={busy} onClick={moreJobs}>
                Show more published roles
              </button>
            )}
            <button
              className="button primary"
              disabled={busy || !jobId}
              onClick={() => {
                const op = `track:${jobId}`;
                void mutate(() => client.track({ jobId }, requestKey(op)), op);
              }}
            >
              Track selected role
            </button>
          </section>
          {record && (
            <article
              className="application-detail"
              aria-label="Selected application record"
              key={record.id}
            >
              <section className="panel">
                <h2>{record.title}</h2>
                <p>
                  {record.company} · cycle {record.cycle} ·{" "}
                  {record.stage === "Saved"
                    ? "Preparation only"
                    : `${record.stage} (user-reported)`}{" "}
                  · revision {record.revision}
                </p>
                <p className="muted">
                  Saved job snapshot.{" "}
                  {record.available
                    ? "The catalog currently has this role; verify availability at its source."
                    : "This listing is no longer available in the catalog. Your notes and history remain accessible."}
                </p>
                {record.sources.map((source) => (
                  <div key={source.id}>
                    <strong>
                      {source.publisher} · {source.name}
                    </strong>
                    {source.isDemo && <p className="pill">Fictional demonstration role</p>}
                    {source.available ? (
                      <a
                        className="text-link"
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Visit original source ↗
                      </a>
                    ) : (
                      <p className="muted">Historical source · current link unavailable</p>
                    )}
                    {source.freshness === "uncertain" && (
                      <p className="muted">
                        The saved source had uncertain availability. A failed check does not prove
                        closure.
                      </p>
                    )}
                  </div>
                ))}
                <p className="muted">
                  Opening a source does not submit an application. No automatic submission or
                  outcome verification occurs.
                </p>
                {record.stage === "Closed" && (
                  <button
                    className="button secondary"
                    disabled={busy || !record.available}
                    onClick={() => {
                      const op = `cycle:${record.id}:${record.revision}`;
                      void mutate(
                        () => client.newCycle(record.id, record.revision, requestKey(op)),
                        op,
                      );
                    }}
                  >
                    Start a new application cycle
                  </button>
                )}
              </section>
              <ApplicationEditor
                record={record}
                choices={choices}
                busy={busy}
                onMoreResumes={() => void moreResumes()}
                onSave={(input) => mutate(() => client.edit(record.id, input))}
              />
              <FollowUps
                record={record}
                busy={busy}
                onAdd={(input) => {
                  const op = `follow:${record.id}:${JSON.stringify(input)}`;
                  return mutate(() => client.addFollowUp(record.id, input, requestKey(op)), op);
                }}
                onEdit={(id, input) => mutate(() => client.editFollowUp(record.id, id, input))}
                onRemove={(id, revision) =>
                  mutate(() => client.removeFollowUp(record.id, id, revision))
                }
              />
              <EventHistory
                id={record.id}
                revision={record.revision}
                client={client}
                onError={failed}
              />
              <section className="panel">
                <h3>Remove this private record</h3>
                <p>
                  Deletes this cycle, its private notes, events and follow-ups. It does not delete
                  the independent resume source.
                </p>
                {removeConfirm ? (
                  <div role="group" aria-label="Confirm application deletion">
                    <button className="button secondary" disabled={busy} onClick={remove}>
                      Confirm record deletion
                    </button>
                    <button className="button secondary" onClick={() => setRemoveConfirm(false)}>
                      Keep record
                    </button>
                  </div>
                ) : (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setRemoveConfirm(true)}
                  >
                    Delete this record
                  </button>
                )}
              </section>
            </article>
          )}
          <section className="panel" aria-label="Tracked roles">
            <h2>Your tracked roles</h2>
            <p>
              {records.length} loaded record{records.length === 1 ? "" : "s"}
              {cursor ? " · more history available" : ""}
            </p>
            {!records.length && <p>Choose a role to begin a private record.</p>}
            <div className="application-record-list">
              {records.map((item) => (
                <button
                  className="application-record-choice"
                  key={item.id}
                  aria-pressed={record?.id === item.id}
                  disabled={busy}
                  onClick={() => void select(item.id)}
                >
                  <strong>{item.title}</strong>
                  <span>
                    {item.company} · cycle {item.cycle} · {item.stage}
                    {item.available ? "" : " · listing unavailable"}
                  </span>
                </button>
              ))}
            </div>
            {cursor && (
              <button className="button secondary" disabled={busy} onClick={moreRecords}>
                Show earlier tracked roles
              </button>
            )}
            <button className="text-link" disabled={busy} onClick={() => void load()}>
              Refresh tracked roles
            </button>
          </section>
        </>
      )}
    </>
  );
}
