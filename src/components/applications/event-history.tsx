"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { ApplicationClient } from "@/modules/applications/ports";
import type { ApplicationEvent } from "@/modules/applications/model";
export function EventHistory({
  id,
  revision,
  client,
  onError,
}: {
  id: string;
  revision: number;
  client: ApplicationClient;
  onError: (error: unknown) => void;
}) {
  const { t } = useI18n();
  const [events, setEvents] = useState<ApplicationEvent[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setEvents([]);
    setCursor(null);
    client
      .events(id)
      .then((page) => {
        if (active) {
          setEvents(page.data);
          setCursor(page.nextCursor);
        }
      })
      .catch((error) => {
        if (active) onError(error);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [id, revision, client, retry]);
  async function more() {
    if (!cursor) return;
    setBusy(true);
    try {
      const page = await client.events(id, cursor);
      setEvents((current) => [
        ...new Map([...current, ...page.data].map((item) => [item.id, item])).values(),
      ]);
      setCursor(page.nextCursor);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel" aria-label={t("Application event history")}>
      <h3>{t("Your record history")}</h3>
      <p className="muted">
        {t(
          "Every stage is manually reported. Edits and follow-ups do not imply an application was submitted.",
        )}
      </p>
      <ol className="application-events">
        {events.map((event) => (
          <li key={event.id}>
            <strong>
              {event.kind === "stage"
                ? t("{from} → {to} (user-reported)", {
                    from: event.previousStage ? t(event.previousStage) : "",
                    to: t(event.stage),
                  })
                : event.kind === "tracked"
                  ? t("Tracked as Saved")
                  : event.kind === "resume-removed"
                    ? t("Deleted resume source unlinked")
                    : event.kind === "follow-up"
                      ? t("Follow-up updated")
                      : t("Private fields updated")}
            </strong>
            <p>
              <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time> ·{" "}
              {t("revision {revision}", { revision: event.revision })}
            </p>
            {event.confirmationReference && (
              <p>{t("Your reference: {reference}", { reference: event.confirmationReference })}</p>
            )}
          </li>
        ))}
      </ol>
      {busy && <p role="status">{t("Loading history…")}</p>}
      {cursor && (
        <button className="button secondary" disabled={busy} onClick={more}>
          {t("Show earlier events")}
        </button>
      )}
      <button className="text-link" disabled={busy} onClick={() => setRetry((value) => value + 1)}>
        {t("Refresh event history")}
      </button>
    </section>
  );
}
