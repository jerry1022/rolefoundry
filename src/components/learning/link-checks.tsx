"use client";
import { useEffect, useRef, useState } from "react";
import type { LinkAdminPage } from "@/modules/course-links/model";
import type { CourseLinkClient } from "@/modules/course-links/ports";
import { ApplicationError } from "@/modules/platform/errors";
const observations: Record<LinkAdminPage["checks"][number]["reason"], string> = {
  unknown: "Not checked",
  ok: "Responding",
  "not-found": "Page not found",
  "rate-limit": "Provider rate limit",
  unsupported: "Status check unsupported",
  "access-denied": "Access restricted",
  redirect: "Redirect needs review",
  blocked: "Address blocked",
  timeout: "Check timed out",
  network: "Connection unavailable",
  "http-error": "Response needs review",
  "server-error": "Provider unavailable",
  "invalid-response": "Invalid response",
};
export function CourseLinkChecks({ client }: { client: CourseLinkClient }) {
  const [data, setData] = useState<LinkAdminPage>(),
    [query, setQuery] = useState<{ cursor?: string; hostCursor?: string }>({}),
    [reload, setReload] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reason, setReason] = useState("");
  const lock = useRef(false),
    epoch = useRef(0);
  useEffect(() => {
    const controller = new AbortController(),
      current = ++epoch.current;
    setData(undefined);
    setError("");
    setBusy(true);
    client
      .list(query, controller.signal)
      .then((value) => {
        if (epoch.current === current && !controller.signal.aborted) setData(value);
      })
      .catch((failure) => {
        if (!controller.signal.aborted && epoch.current === current)
          setError(
            failure instanceof ApplicationError
              ? failure.message
              : "Link observations are temporarily unavailable.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted && epoch.current === current) setBusy(false);
      });
    return () => {
      controller.abort();
      epoch.current++;
    };
  }, [client, query, reload]);
  async function resume(host: LinkAdminPage["hosts"][number]) {
    if (lock.current || !reason.trim()) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const current = epoch.current;
    try {
      await client.resume({ host: host.host, expectedRevision: host.revision, reason });
      if (current === epoch.current) {
        setReason("");
        setReload((value) => value + 1);
      }
    } catch (failure) {
      if (current === epoch.current) {
        setData(undefined);
        setError(
          failure instanceof ApplicationError
            ? failure.message
            : "Recovery could not be confirmed. Refresh before trying again.",
        );
      }
    } finally {
      lock.current = false;
      if (current === epoch.current) setBusy(false);
    }
  }
  return (
    <section className="course-link-panel" aria-label="Course link observations">
      <p>
        Link checks observe reviewed official URLs. They do not verify lesson content, price, access
        or editorial freshness. Failed checks require review; successful checks do not clear an
        editorial warning.
      </p>
      <p>
        Checks run only for deployment-approved sources. Dates show the last observation, not an
        active check on this page.
      </p>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Loading or updating link observations…</p>}
      <button
        className="button secondary"
        disabled={busy}
        onClick={() => {
          setQuery({});
          setReload((value) => value + 1);
        }}
      >
        Refresh link observations
      </button>
      {data && (
        <>
          <h3>Published course observations</h3>
          {!data.checks.length && (
            <p>
              No observations on this page. Automatic checks are disabled until a source policy is
              configured.
            </p>
          )}
          <div className="course-link-grid">
            {data.checks.map((check) => (
              <article className="course-link-card" key={check.id}>
                <h4>{check.title}</h4>
                <code>{check.id}</code>
                <dl>
                  <div>
                    <dt>Observation</dt>
                    <dd>
                      {check.busy ? "Checking" : observations[check.reason]}
                      {check.httpStatus ? ` (${check.httpStatus})` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Last checked</dt>
                    <dd>
                      {check.checkedAt ? new Date(check.checkedAt).toLocaleString() : "Not checked"}
                    </dd>
                  </div>
                  <div>
                    <dt>Next eligible check</dt>
                    <dd>{new Date(check.nextCheckAt).toLocaleString()}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
          {data.nextCursor && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setQuery((value) => ({ ...value, cursor: data.nextCursor! }))}
            >
              Next course observations
            </button>
          )}
          <h3>Shared host limits</h3>
          <p>
            At most one probe per approved host set per minute across checker instances. A known
            provider wait cannot be shortened by clearing a manual pause.
          </p>
          <label>
            Recovery reason
            <input
              className="text-input"
              value={reason}
              maxLength={1000}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          {!data.hosts.length && <p>No host state has been created.</p>}
          {data.hosts.map((host) => (
            <div className="course-link-card" key={host.host}>
              <p>
                <strong>{host.host}</strong> —{" "}
                {host.manualPause ? "Paused for operator review" : "Scheduled"}; not before{" "}
                {new Date(host.notBefore).toLocaleString()}
              </p>
              {host.manualPause && (
                <button
                  className="button secondary"
                  disabled={busy || !reason.trim()}
                  onClick={() => void resume(host)}
                >
                  Clear manual pause for {host.host}
                </button>
              )}
            </div>
          ))}
          {data.nextHostCursor && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setQuery((value) => ({ ...value, hostCursor: data.nextHostCursor! }))}
            >
              Next host limits
            </button>
          )}
        </>
      )}
    </section>
  );
}
