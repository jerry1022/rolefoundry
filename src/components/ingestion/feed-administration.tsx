"use client";
import { useEffect, useRef, useState } from "react";
import type { FeedAdminClient } from "@/modules/ingestion/ports";
import type {
  FeedSetting,
  FeedConfiguration,
  FeedRun,
  ApprovedFeedOption,
} from "@/modules/ingestion/model";
import { ApplicationError } from "@/modules/platform/errors";
function FeedSettingsForm({
  setting,
  definitions,
  busy,
  save,
  fetchNow,
}: {
  setting: FeedSetting;
  definitions: ApprovedFeedOption[];
  busy: boolean;
  save: (input: FeedConfiguration) => Promise<void>;
  fetchNow: () => Promise<void>;
}) {
  const options = definitions.filter((feed) => feed.kind === setting.kind),
    [feedId, setFeedId] = useState(setting.feedId || options[0]?.id || ""),
    [enabled, setEnabled] = useState(setting.enabled),
    [minutes, setMinutes] = useState(setting.intervalMinutes),
    [resume, setResume] = useState(false),
    current = definitions.some(
      (feed) => feed.id === setting.feedId && feed.revision === setting.feedRevision,
    ),
    waiting =
      setting.manualPause ||
      (!!setting.pauseUntil && new Date(setting.pauseUntil).getTime() > Date.now());
  return (
    <form
      className="panel section-block"
      onSubmit={(event) => {
        event.preventDefault();
        void save({
          expectedRevision: setting.revision,
          feedId,
          enabled,
          intervalMinutes: minutes,
          resume,
        });
      }}
    >
      <h4>
        {setting.name} · {setting.kind}
      </h4>
      <p>
        Source {setting.sourceStatus}. Next scheduled check:{" "}
        {setting.nextFetchAt || "not scheduled"}.
      </p>
      {setting.manualPause && (
        <p className="notice">
          Automatic retrieval is paused for operator review. Reported provider wait:{" "}
          {setting.providerWait || "unknown"} seconds. Earliest retry:{" "}
          {setting.pauseUntil || "requires review"}.
        </p>
      )}
      {setting.lastError && (
        <p>
          Last retrieval issue: {setting.lastError}. Published metadata is retained; availability
          may be uncertain.
        </p>
      )}
      {setting.feedId && !current && (
        <p className="notice">
          The approved feed definition changed or is unavailable. Review and save the current
          configuration before fetching.
        </p>
      )}
      <fieldset
        className="profile-form-fields"
        disabled={busy || setting.sourceStatus !== "active"}
      >
        <label>
          Approved feed for {setting.name}
          <select
            className="text-input"
            aria-label={`Approved feed for ${setting.name}`}
            required
            value={feedId}
            onChange={(event) => setFeedId(event.target.value)}
          >
            <option value="">Select an approved feed</option>
            {options.map((feed) => (
              <option key={feed.id} value={feed.id}>
                {feed.id} · {feed.format}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          Enable scheduled retrieval for {setting.name}
        </label>
        <label>
          Refresh interval for {setting.name} (minutes)
          <input
            className="text-input"
            aria-label={`Refresh interval for ${setting.name}`}
            type="number"
            min={15}
            max={10080}
            step={1}
            required
            value={minutes}
            onChange={(event) => setMinutes(event.target.valueAsNumber)}
          />
        </label>
        {setting.manualPause && (
          <label>
            <input
              type="checkbox"
              checked={resume}
              onChange={(event) => setResume(event.target.checked)}
            />
            Resume after reviewing the provider wait for {setting.name}
          </label>
        )}
        <p className="muted">
          Saving assigns this schedule to your administrator account. Revoked sources and inactive
          owners are skipped. A reported provider wait cannot be resumed early.
        </p>
        <button className="button secondary" type="submit" disabled={!feedId}>
          Save feed settings for {setting.name}
        </button>
        <button
          className="button secondary"
          type="button"
          disabled={!setting.enabled || !current || waiting}
          onClick={() => void fetchNow()}
        >
          Fetch approved feed for {setting.name}
        </button>
      </fieldset>
    </form>
  );
}
export function FeedAdministration({
  client,
  onOpenBatch,
  onSettingsChanged,
  onDenied,
}: {
  client: FeedAdminClient;
  onOpenBatch: (id: string) => Promise<void>;
  onSettingsChanged: () => Promise<void>;
  onDenied: () => void;
}) {
  const [data, setData] = useState<{
      settings: FeedSetting[];
      definitions: ApprovedFeedOption[];
    } | null>(null),
    [runs, setRuns] = useState<FeedRun[]>([]),
    [active, setActive] = useState<FeedRun | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [polling, setPolling] = useState(true);
  const lock = useRef(false),
    pending = useRef(new Map<string, string>()),
    epoch = useRef(0);
  function failed(error: unknown) {
    setError(
      error instanceof ApplicationError
        ? error.message
        : "The feed request or refresh could not be completed. Refresh saved runs before retrying.",
    );
    if (error instanceof ApplicationError && [401, 403].includes(error.status)) onDenied();
  }
  useEffect(() => {
    let present = true;
    void Promise.all([client.settings(), client.list()])
      .then(([settings, runs]) => {
        if (present) {
          setData(settings);
          setRuns(runs);
        }
      })
      .catch((error) => {
        if (present) failed(error);
      });
    return () => {
      present = false;
      epoch.current++;
    };
  }, [client]);
  useEffect(() => {
    if (!active || !["queued", "running"].includes(active.status) || !polling) return;
    const id = active.id,
      opened = epoch.current;
    let present = true,
      count = 0,
      timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await client.find(id);
        if (!present || epoch.current !== opened) return;
        setActive(next);
        setRuns((current) => current.map((run) => (run.id === id ? next : run)));
        count++;
        if (["queued", "running"].includes(next.status) && count < 60)
          timer = setTimeout(() => void poll(), 1000);
        else {
          setPolling(false);
          setData(await client.settings());
        }
      } catch (error) {
        if (present && epoch.current === opened) {
          setPolling(false);
          failed(error);
        }
      }
    }
    timer = setTimeout(() => void poll(), 1000);
    return () => {
      present = false;
      clearTimeout(timer);
    };
  }, [active?.id, active?.status, client, polling]);
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
  async function open(run: FeedRun) {
    epoch.current++;
    setActive(await client.find(run.id));
    setPolling(true);
  }
  return (
    <details className="panel section-block" aria-label="Approved feed administration">
      <summary>Approved remote feeds and schedules</summary>
      <p>
        Fetch only deployment-approved feeds. Retrieved data becomes a batch for review; it is never
        published automatically. Missing rows do not close existing records.
      </p>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {!data && <p role="status">Loading feed settings…</p>}
      {data && !data.definitions.length && (
        <p>
          No approved feeds are available on this deployment. An operator must register an
          authorized feed before retrieval can be enabled.
        </p>
      )}
      <button
        className="button secondary"
        disabled={busy}
        onClick={() =>
          void perform(async () => {
            setData(await client.settings());
            setRuns(await client.list());
          })
        }
      >
        Refresh approved feeds and runs
      </button>
      {data?.settings.map((setting) => (
        <FeedSettingsForm
          key={`${setting.sourceId}:${setting.revision}:${setting.manualPause}:${setting.pauseUntil}`}
          setting={setting}
          definitions={data.definitions}
          busy={busy}
          save={(input) =>
            perform(async () => {
              await client.configure(setting.sourceId, input);
              setData(await client.settings());
              await onSettingsChanged();
            })
          }
          fetchNow={() =>
            perform(async () => {
              const identity = `${setting.sourceId}:${setting.revision}`;
              let key = pending.current.get(identity);
              if (!key) {
                key = crypto.randomUUID();
                pending.current.set(identity, key);
              }
              const run = await client.request(setting.sourceId, key);
              pending.current.delete(identity);
              await open(run);
              setRuns(await client.list());
              setData(await client.settings());
            })
          }
        />
      ))}
      <h3>Recent feed runs</h3>
      {!runs.length && <p>No retrieval runs yet.</p>}
      {runs.map((run) => (
        <article className="section-block" key={run.id}>
          <strong>{run.feedId}</strong>
          <p>
            {run.status} · {run.createdAt}
            {run.errorCode ? ` · ${run.errorCode}` : ""}
          </p>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void perform(() => open(run))}
          >
            Inspect feed run {run.id}
          </button>
          {run.batchId && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void perform(() => onOpenBatch(run.batchId!))}
            >
              Open fetched batch {run.id}
            </button>
          )}
        </article>
      ))}
      {active && (
        <section className="panel section-block" aria-label="Selected feed run">
          <h3>Selected feed run</h3>
          <p role="status">
            {active.status} · {active.feedId}
          </p>
          {active.errorCode && <p>Retrieval issue: {active.errorCode}</p>}
          {!polling && ["queued", "running"].includes(active.status) && (
            <p>Automatic checking paused. Inspect the run to resume.</p>
          )}
          {active.batchId && (
            <button
              className="button"
              disabled={busy}
              onClick={() => void perform(() => onOpenBatch(active.batchId!))}
            >
              Review fetched batch
            </button>
          )}
        </section>
      )}
    </details>
  );
}
