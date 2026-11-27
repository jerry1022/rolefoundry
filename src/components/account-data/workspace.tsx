"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AccountDataClient } from "@/modules/account-data/ports";
import type { AccountExportPage } from "@/modules/account-data/model";
import { ApplicationError } from "@/modules/platform/errors";
import { msg, useI18n } from "@/lib/i18n";
/** Client fallback; translated when shown so a stable callback can set it. */
const unavailable = msg("Your export is temporarily unavailable.");
function date(value: string) {
  return (
    new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value)) + " UTC"
  );
}
export function AccountDataWorkspace({ client }: { client: AccountDataClient }) {
  const { t } = useI18n();
  const [page, setPage] = useState<AccountExportPage | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const mounted = useRef(false),
    lock = useRef(false),
    key = useRef<string | null>(null),
    generation = useRef(0);
  const fail = useCallback((error: unknown) => {
    if (!mounted.current) return;
    setError(error instanceof ApplicationError ? error.message : unavailable);
    if (error instanceof ApplicationError && [401, 403].includes(error.status)) setPage(null);
  }, []);
  const refresh = useCallback(async () => {
    const current = generation.current;
    try {
      const next = await client.list();
      if (mounted.current && generation.current === current) setPage(next);
    } catch (error) {
      if (generation.current === current) throw error;
    }
  }, [client]);
  useEffect(() => {
    mounted.current = true;
    void refresh().catch(fail);
    return () => {
      mounted.current = false;
    };
  }, [refresh, fail]);
  const pending = page?.data.some((row) => ["queued", "running"].includes(row.status)) ?? false;
  useEffect(() => {
    if (!pending) return;
    let stopped = false,
      timer: ReturnType<typeof setTimeout> | undefined,
      count = 0;
    const poll = async () => {
      try {
        if (!lock.current) await refresh();
      } catch (error) {
        fail(error);
      }
      if (!stopped && ++count < 40)
        timer = setTimeout(poll, Math.min(1500 * 2 ** Math.floor(count / 5), 15000));
    };
    timer = setTimeout(poll, 1500);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pending, refresh, fail]);
  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    generation.current++;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (error) {
      fail(error);
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section
      className="panel section-block account-data-workspace"
      aria-label={t("Your account data export")}
    >
      <h2>{t("Download your account data")}</h2>
      <p>
        {t(
          "Create a private ZIP with your retained career records, resume source files and generated PDFs. It is available for 24 hours. Deleting source data or disabling your account invalidates retained archives.",
        )}
      </p>
      <p className="muted">
        {t(
          "The archive contains personal information. Save it somewhere you trust. Public catalogs, credentials and other accounts' private records are excluded. An export does not delete your account.",
        )}
      </p>
      <p>
        {t(
          "Up to three requests per 24 hours and one pending request. Large requests fail explicitly; records and files are never silently truncated.",
        )}
      </p>
      {error && (
        <p role="alert" className="notice">
          {error === unavailable ? t(unavailable) : error}
        </p>
      )}
      <div className="button-row">
        <button
          className="button primary"
          disabled={busy || pending}
          onClick={() =>
            void run(async () => {
              key.current ??= crypto.randomUUID();
              await client.request(key.current);
              key.current = null;
              await refresh();
            })
          }
        >
          {t("Create private account export")}
        </button>
        <button className="button secondary" disabled={busy} onClick={() => void run(refresh)}>
          {t("Refresh account exports")}
        </button>
      </div>
      {!page && !error && <p role="status">{t("Loading your exports…")}</p>}
      {pending && (
        <p role="status">
          {t(
            "Your archive is being prepared by the background worker. You may leave this page and return.",
          )}
        </p>
      )}
      {page?.data.length === 0 && <p>{t("No account exports yet.")}</p>}
      {page?.data.map((item) => (
        <article key={item.id} className="panel section-block">
          <h3>{t("Account archive · {status}", { status: item.status })}</h3>
          <p>{item.id}</p>
          <p>
            {t("Requested {requested}. Available until {expires}.", {
              requested: date(item.createdAt),
              expires: date(item.expiresAt),
            })}
            {item.byteCount
              ? ` ${t("{size} KB.", { size: Math.ceil(item.byteCount / 1024) })}`
              : ""}
          </p>
          {item.status === "ready" && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const bytes = await client.download(item.id);
                  const url = URL.createObjectURL(
                    new Blob([new Uint8Array(bytes).buffer], { type: "application/zip" }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `rolefoundry-account-${item.id}.zip`;
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                })
              }
            >
              {t("Download account archive")}
            </button>
          )}
          {["queued", "running", "ready"].includes(item.status) && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await client.remove(item.id);
                  await refresh();
                })
              }
            >
              {t("Remove account archive")}
            </button>
          )}
          {["failed", "invalidated", "expired"].includes(item.status) && (
            <p>
              {t("This archive cannot be downloaded. Request a new snapshot of your current data.")}
            </p>
          )}
        </article>
      ))}
      {page?.nextCursor && (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const next = await client.list(page.nextCursor!);
              if (mounted.current) setPage({ ...next, data: [...page.data, ...next.data] });
            })
          }
        >
          {t("Load older account exports")}
        </button>
      )}
    </section>
  );
}
