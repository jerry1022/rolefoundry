"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ImportAdminClient, FeedAdminClient } from "@/modules/ingestion/ports";
import {
  ingestionLimits,
  type ImportBatch,
  type ImportBatchSummary,
  type ImportFormat,
  type ImportReview,
  type ImportSetting,
} from "@/modules/ingestion/model";
import { ApplicationError } from "@/modules/platform/errors";
import { FeedAdministration } from "./feed-administration";
import { JobSourceRegistration } from "./source-registration";
import { ImportReviewPanel } from "./review-panel";
function SourceSettings({
  source,
  busy,
  save,
}: {
  source: ImportSetting;
  busy: boolean;
  save: (enabled: boolean, closure: boolean) => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(source.uploadsEnabled),
    [closure, setClosure] = useState(source.allowClosure);
  return (
    <form
      className="panel"
      onSubmit={(event) => {
        event.preventDefault();
        void save(enabled, closure);
      }}
    >
      <h3>
        {source.name} · {source.kind}
      </h3>
      <p>
        {source.sourceStatus} · allowed hosts: {source.allowedHosts.join(", ")}
      </p>
      <p>Permitted fields: {source.permittedFields.join(", ")}</p>
      <fieldset disabled={busy}>
        <label>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          Enable authorized uploads for {source.name}
        </label>
        <label>
          <input
            type="checkbox"
            checked={closure}
            onChange={(event) => setClosure(event.target.checked)}
          />
          Allow explicit closure for {source.name}
        </label>
        <button className="button secondary" type="submit">
          Save settings for {source.name}
        </button>
      </fieldset>
    </form>
  );
}
export function ImportAdministration({
  client,
  feedClient,
  isAdmin,
}: {
  client: ImportAdminClient;
  feedClient: FeedAdminClient;
  isAdmin: () => Promise<boolean>;
}) {
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking"),
    [sources, setSources] = useState<ImportSetting[]>([]),
    [history, setHistory] = useState<{
      data: ImportBatchSummary[];
      nextCursor: string | null;
    } | null>(null),
    [sourceId, setSourceId] = useState(""),
    [batchId, setBatchId] = useState(""),
    [format, setFormat] = useState<ImportFormat>("json"),
    [content, setContent] = useState(""),
    [batch, setBatch] = useState<ImportBatch | null>(null),
    [review, setReview] = useState<ImportReview | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [polling, setPolling] = useState(true);
  const lock = useRef(false),
    epoch = useRef(0),
    pending = useRef<{ payload: string; key: string } | null>(null);
  function denied() {
    epoch.current++;
    setAccess("denied");
    setSources([]);
    setHistory(null);
    setBatch(null);
    setReview(null);
    setContent("");
  }
  function failed(error: unknown) {
    setError(
      error instanceof ApplicationError
        ? error.message
        : "The import workspace is temporarily unavailable. Your upload draft is still here.",
    );
    if (error instanceof ApplicationError && [401, 403].includes(error.status)) denied();
  }
  useEffect(() => {
    let present = true;
    void isAdmin()
      .then(async (allowed) => {
        if (!present) return;
        if (!allowed) {
          setAccess("denied");
          return;
        }
        const [settings, batches] = await Promise.all([client.settings(), client.list()]);
        if (present) {
          setSources(settings);
          setHistory(batches);
          setAccess("allowed");
        }
      })
      .catch((error) => {
        if (present) failed(error);
      });
    return () => {
      present = false;
      epoch.current++;
    };
  }, [client, isAdmin]);
  useEffect(() => {
    if (!batch || !["queued", "running"].includes(batch.status) || !polling || access !== "allowed")
      return;
    const id = batch.id,
      opened = epoch.current;
    let present = true,
      count = 0,
      timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await client.find(id);
        if (!present || opened !== epoch.current) return;
        setBatch((current) =>
          current?.id === id && next.revision >= current.revision ? next : current,
        );
        count++;
        if (["queued", "running"].includes(next.status) && count < 60)
          timer = setTimeout(() => void poll(), 1000);
        else {
          setPolling(false);
          setHistory(await client.list());
        }
      } catch (error) {
        if (present && opened === epoch.current) {
          failed(error);
          setPolling(false);
        }
      }
    }
    timer = setTimeout(() => void poll(), 1000);
    return () => {
      present = false;
      clearTimeout(timer);
    };
  }, [batch?.id, batch?.status, client, polling, access]);
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
  async function open(id: string) {
    epoch.current++;
    const next = await client.find(id);
    setReview(null);
    setBatch(next);
    setPolling(true);
  }
  async function submit() {
    if (new TextEncoder().encode(content).byteLength > ingestionLimits.bytes) {
      setError("The import exceeds 2 MiB. Split it into smaller batches.");
      return;
    }
    const input = { sourceId, batchId, format, content },
      payload = JSON.stringify(input);
    if (pending.current?.payload !== payload)
      pending.current = { payload, key: crypto.randomUUID() };
    const result = await client.submit(input, pending.current.key);
    pending.current = null;
    await open(result.id);
    setHistory(await client.list());
  }
  const selected = sources.find((source) => source.id === sourceId);
  return (
    <section
      className="section-block ingestion-workspace"
      aria-label="Source import administration"
      style={{ overflowWrap: "anywhere", minWidth: 0 }}
    >
      <h2>Source imports and publication review</h2>
      <p className="muted">
        Upload authorized job or course metadata, inspect the proposed changes and record a
        publication decision. Uploads never publish automatically.
      </p>
      {error && (
        <div className="notice" role="alert">
          {error}
          <button className="button secondary" onClick={() => window.location.reload()}>
            Reload import workspace
          </button>
        </div>
      )}
      {access === "checking" && <p role="status">Checking administrator access…</p>}
      {access === "denied" && (
        <p className="panel">
          Administrator access is required. <Link href="/account/">Open account and privacy</Link>
        </p>
      )}
      {access === "allowed" && (
        <>
          <FeedAdministration
            client={feedClient}
            onDenied={denied}
            onOpenBatch={(id) => perform(() => open(id))}
            onSettingsChanged={async () => setSources(await client.settings())}
          />
          <JobSourceRegistration
            busy={busy}
            register={(policy) =>
              perform(async () => {
                const registered = await client.registerJobSource(policy);
                setSources(await client.settings());
                setSourceId(registered.id);
              })
            }
          />
          <details>
            <summary>Authorized source settings ({sources.length})</summary>
            {!sources.length && (
              <p>
                No authorized sources are configured. Create and review a source policy before
                enabling uploads.
              </p>
            )}
            {sources.map((source) => (
              <SourceSettings
                key={`${source.id}:${source.revision}`}
                source={source}
                busy={busy}
                save={(enabled, closure) =>
                  perform(async () => {
                    await client.configure(source.id, {
                      expectedRevision: source.revision,
                      uploadsEnabled: enabled,
                      allowClosure: closure,
                    });
                    setSources(await client.settings());
                  })
                }
              />
            ))}
          </details>
          <form
            className="panel section-block"
            onSubmit={(event) => {
              event.preventDefault();
              void perform(submit);
            }}
          >
            <h3>Upload a source batch</h3>
            <p>
              Up to 100 records and 2 MiB. Keep a stable batch identifier when retrying the same
              file. Missing fields preserve curated values; explicit null clears a field.
            </p>
            <fieldset className="profile-form-fields" disabled={busy}>
              <label>
                Authorized source
                <select
                  className="text-input"
                  aria-label="Import source"
                  required
                  value={sourceId}
                  onChange={(event) => setSourceId(event.target.value)}
                >
                  <option value="">Choose an enabled source</option>
                  {sources
                    .filter((source) => source.status === "active")
                    .map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.name} · {source.kind}
                      </option>
                    ))}
                </select>
              </label>
              {selected && (
                <p>
                  Permitted fields: {selected.permittedFields.join(", ")}. Original links must use{" "}
                  {selected.allowedHosts.join(", ")}.
                </p>
              )}
              <label>
                Batch identifier
                <input
                  className="text-input"
                  aria-label="Import batch identifier"
                  maxLength={120}
                  required
                  value={batchId}
                  onChange={(event) => setBatchId(event.target.value)}
                />
              </label>
              <label>
                File format
                <select
                  className="text-input"
                  aria-label="Import format"
                  value={format}
                  onChange={(event) => setFormat(event.target.value as ImportFormat)}
                >
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                </select>
              </label>
              <label>
                Choose a local import file
                <input
                  type="file"
                  aria-label="Import file"
                  accept=".json,.csv,application/json,text/csv"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    void perform(async () => {
                      if (file.size > ingestionLimits.bytes)
                        throw new ApplicationError(
                          "RF_TOO_LARGE",
                          413,
                          "Choose a file no larger than 2 MiB.",
                        );
                      const text = await file.text();
                      if (new TextEncoder().encode(text).byteLength > ingestionLimits.bytes)
                        throw new ApplicationError(
                          "RF_TOO_LARGE",
                          413,
                          "The decoded file exceeds 2 MiB.",
                        );
                      setContent(text);
                      setFormat(file.name.toLowerCase().endsWith(".csv") ? "csv" : "json");
                    });
                  }}
                />
              </label>
              <label>
                Import content
                <textarea
                  className="text-input"
                  aria-label="Import content"
                  rows={8}
                  required
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                />
              </label>
              <details>
                <summary>File structure</summary>
                <p>
                  JSON uses a records array. Each record has externalId, url, state (active or
                  closed) and fields containing only permitted metadata. CSV uses
                  externalId,url,state and permitted metadata columns; structured cells contain
                  JSON. A blank CSV cell means missing, and null means an explicit clear.
                </p>
                <pre style={{ whiteSpace: "pre-wrap" }}>
                  {
                    '{"records":[{"externalId":"source-record-1","url":"https://your-approved-host.example/role/1","state":"active","fields":{"title":"AI engineer"}}]}'
                  }
                </pre>
              </details>
              <button
                className="button"
                type="submit"
                disabled={!selected || selected.status !== "active"}
              >
                Queue import for review
              </button>
            </fieldset>
          </form>
          <details className="panel section-block" open={!batch}>
            <summary>Import batch history</summary>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  setHistory(await client.list());
                  setSources(await client.settings());
                })
              }
            >
              Refresh batches and settings
            </button>
            {history?.data.length === 0 && <p>No batches yet.</p>}
            {history?.data.map((item) => (
              <article className="section-block" key={item.id}>
                <strong>{item.batchId}</strong>
                <p>
                  {item.status} · {item.total} records · {item.rejectedCount} rejected ·{" "}
                  {item.createdAt}
                </p>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void perform(() => open(item.id))}
                >
                  Open batch {item.batchId}
                </button>
              </article>
            ))}
            {history?.nextCursor && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    const next = await client.list(history.nextCursor!);
                    setHistory({ ...next, data: [...history.data, ...next.data] });
                  })
                }
              >
                Load older import batches
              </button>
            )}
          </details>
          {batch && (
            <section className="panel section-block" aria-label="Selected import batch">
              <h3>Batch {batch.batchId}</h3>
              <p role="status">
                {batch.status} · {batch.total} records · {batch.items.length} review items ·{" "}
                {batch.rejected.length} rejected
              </p>
              {!batch.sourceCurrent && (
                <p className="notice">Source permissions or settings changed after submission.</p>
              )}
              {batch.errorCode && (
                <p className="notice">
                  Processing stopped: {batch.errorCode}. Review source settings before creating a
                  new batch.
                </p>
              )}
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    const next = await client.find(batch.id);
                    setBatch(next);
                    setPolling(true);
                  })
                }
              >
                Refresh selected batch
              </button>
              {!polling && ["queued", "running"].includes(batch.status) && (
                <p>Automatic polling paused. Refresh to resume checking.</p>
              )}
              {!!batch.rejected.length && (
                <div>
                  <h4>Rejected input rows</h4>
                  <ul>
                    {batch.rejected.map((row) => (
                      <li key={row.position}>
                        Row {row.position} · {row.externalId || "unidentified"}:{" "}
                        {row.issues.map((issue) => `${issue.code} (${issue.field})`).join(", ")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {batch.items.map((item) => (
                <article className="section-block" key={item.id}>
                  <strong>
                    Row {item.normalized.position}: {item.normalized.externalId}
                  </strong>
                  <p>
                    {item.state} · {item.normalized.disposition} · {item.normalized.changes.length}{" "}
                    changes
                  </p>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        setReview(await client.review(item.id));
                      })
                    }
                  >
                    Review row {item.normalized.position}
                  </button>
                </article>
              ))}
            </section>
          )}
          {review && (
            <ImportReviewPanel
              key={`${review.id}:${review.previewId}`}
              initial={review}
              client={client}
              onDenied={denied}
              onChanged={async () => {
                if (batch) {
                  const next = await client.find(batch.id);
                  setBatch((current) =>
                    current?.id === next.id && next.revision >= current.revision ? next : current,
                  );
                }
                setHistory(await client.list());
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
