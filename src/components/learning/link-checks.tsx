"use client";
import { useEffect, useRef, useState } from "react";
import { msg, useI18n } from "@/lib/i18n";
import type { LinkAdminPage } from "@/modules/course-links/model";
import type { CourseLinkClient } from "@/modules/course-links/ports";
import { ApplicationError } from "@/modules/platform/errors";
const observations: Record<LinkAdminPage["checks"][number]["reason"], string> = {
  unknown: msg("Not checked"),
  ok: msg("Responding"),
  "not-found": msg("Page not found"),
  "rate-limit": msg("Provider rate limit"),
  unsupported: msg("Status check unsupported"),
  "access-denied": msg("Access restricted"),
  redirect: msg("Redirect needs review"),
  blocked: msg("Address blocked"),
  timeout: msg("Check timed out"),
  network: msg("Connection unavailable"),
  "http-error": msg("Response needs review"),
  "server-error": msg("Provider unavailable"),
  "invalid-response": msg("Invalid response"),
};
export function CourseLinkChecks({ client }: { client: CourseLinkClient }) {
  const { t, locale } = useI18n();
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
              : t("Link observations are temporarily unavailable."),
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
            : t("Recovery could not be confirmed. Refresh before trying again."),
        );
      }
    } finally {
      lock.current = false;
      if (current === epoch.current) setBusy(false);
    }
  }
  return (
    <section className="course-link-panel" aria-label={t("Course link observations")}>
      <p>
        {t(
          "Link checks observe reviewed official URLs. They do not verify lesson content, price, access or editorial freshness. Failed checks require review; successful checks do not clear an editorial warning.",
        )}
      </p>
      <p>
        {t(
          "Checks run only for deployment-approved sources. Dates show the last observation, not an active check on this page.",
        )}
      </p>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">{t("Loading or updating link observations…")}</p>}
      <button
        className="button secondary"
        disabled={busy}
        onClick={() => {
          setQuery({});
          setReload((value) => value + 1);
        }}
      >
        {t("Refresh link observations")}
      </button>
      {data && (
        <>
          <h3>{t("Published course observations")}</h3>
          {!data.checks.length && (
            <p>
              {t(
                "No observations on this page. Automatic checks are disabled until a source policy is configured.",
              )}
            </p>
          )}
          <div className="course-link-grid">
            {data.checks.map((check) => (
              <article className="course-link-card" key={check.id}>
                <h4>{check.title}</h4>
                <code>{check.id}</code>
                <dl>
                  <div>
                    <dt>{t("Observation")}</dt>
                    <dd>
                      {check.busy ? t("Checking") : t(observations[check.reason])}
                      {check.httpStatus ? ` (${check.httpStatus})` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("Last checked")}</dt>
                    <dd>
                      {check.checkedAt
                        ? new Date(check.checkedAt).toLocaleString(locale)
                        : t("Not checked")}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("Next eligible check")}</dt>
                    <dd>{new Date(check.nextCheckAt).toLocaleString(locale)}</dd>
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
              {t("Next course observations")}
            </button>
          )}
          <h3>{t("Shared host limits")}</h3>
          <p>
            {t(
              "At most one probe per approved host set per minute across checker instances. A known provider wait cannot be shortened by clearing a manual pause.",
            )}
          </p>
          <label>
            {t("Recovery reason")}
            <input
              className="text-input"
              value={reason}
              maxLength={1000}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          {!data.hosts.length && <p>{t("No host state has been created.")}</p>}
          {data.hosts.map((host) => (
            <div className="course-link-card" key={host.host}>
              <p>
                <strong>{host.host}</strong> —{" "}
                {host.manualPause
                  ? t("Paused for operator review; not before {time}", {
                      time: new Date(host.notBefore).toLocaleString(locale),
                    })
                  : t("Scheduled; not before {time}", {
                      time: new Date(host.notBefore).toLocaleString(locale),
                    })}
              </p>
              {host.manualPause && (
                <button
                  className="button secondary"
                  disabled={busy || !reason.trim()}
                  onClick={() => void resume(host)}
                >
                  {t("Clear manual pause for {host}", { host: host.host })}
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
              {t("Next host limits")}
            </button>
          )}
        </>
      )}
    </section>
  );
}
