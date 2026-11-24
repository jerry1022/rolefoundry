"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { BookmarkPage } from "@/modules/jobs/model";
import type { BookmarkClient } from "@/modules/jobs/ports";
import { ApplicationError } from "@/modules/platform/errors";
import { msg, useI18n } from "@/lib/i18n";
export function BookmarksPanel({
  client,
  onOpen,
  onChange,
}: {
  client: BookmarkClient;
  onOpen: (id: string) => Promise<void>;
  onChange: () => void;
}) {
  const { t } = useI18n();
  const [page, setPage] = useState<BookmarkPage | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [signedOut, setSignedOut] = useState(false);
  function failed(error: unknown) {
    setError(
      error instanceof ApplicationError ? error.message : msg("Unable to load saved roles."),
    );
    setSignedOut(error instanceof ApplicationError && error.status === 401);
  }
  useEffect(() => {
    let active = true;
    void client
      .list({ limit: 20 })
      .then((value) => {
        if (active) setPage(value);
      })
      .catch((error) => {
        if (active) failed(error);
      });
    return () => {
      active = false;
    };
  }, [client]);
  async function remove(id: string) {
    setBusy(true);
    setError("");
    try {
      await client.remove(id);
      setPage(await client.list({ limit: 20 }));
      onChange();
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section-block">
      <h2>{t("Your saved roles")}</h2>
      <p className="muted">
        {t(
          "Private account bookmarks. Retired roles retain their saved title and source reference.",
        )}
      </p>
      {error && (
        <div className="notice" role="alert">
          <p>{t(error)}</p>
          {signedOut ? (
            <Link className="button secondary" href="/account/">
              {t("Sign in to see saved roles")}
            </Link>
          ) : (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setError("");
                void client.list({ limit: 20 }).then(setPage).catch(failed);
              }}
            >
              {t("Reload saved roles")}
            </button>
          )}
        </div>
      )}
      {!error && !page && <p role="status">{t("Loading saved roles…")}</p>}
      {page && !page.data.length && (
        <div className="panel">
          <h3>{t("No saved roles yet")}</h3>
          <p>{t("Browse published openings and save a role to this account.")}</p>
        </div>
      )}
      <div className="catalog-results">
        {page?.data.map((bookmark) => (
          <article className="panel" key={bookmark.jobId}>
            <h3>{bookmark.title}</h3>
            <p>{bookmark.company}</p>
            <p className="muted">
              {bookmark.available
                ? t("Available in the catalog")
                : t("Retired or unavailable; saved snapshot retained")}
            </p>
            <div className="button-row">
              {bookmark.available && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void onOpen(bookmark.jobId).catch(failed)}
                >
                  {t("View current role")}
                </button>
              )}
              <a
                className="button secondary"
                href={bookmark.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("Original source ↗")}
              </a>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void remove(bookmark.jobId)}
              >
                {t("Remove saved role")}
              </button>
            </div>
          </article>
        ))}
      </div>
      {page?.nextCursor && (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void client
              .list({ limit: 20, cursor: page.nextCursor! })
              .then((next) => setPage({ ...next, data: [...page.data, ...next.data] }))
              .catch(failed)
              .finally(() => setBusy(false));
          }}
        >
          {t("Load more saved roles")}
        </button>
      )}
    </section>
  );
}
