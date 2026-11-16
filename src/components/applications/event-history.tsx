"use client";
import { useEffect, useState } from "react";
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
    <section className="panel" aria-label="Application event history">
      <h3>Your record history</h3>
      <p className="muted">
        Every stage is manually reported. Edits and follow-ups do not imply an application was
        submitted.
      </p>
      <ol className="application-events">
        {events.map((event) => (
          <li key={event.id}>
            <strong>
              {event.kind === "stage"
                ? `${event.previousStage} → ${event.stage} (user-reported)`
                : event.kind === "tracked"
                  ? "Tracked as Saved"
                  : event.kind === "resume-removed"
                    ? "Deleted resume source unlinked"
                    : event.kind === "follow-up"
                      ? "Follow-up updated"
                      : "Private fields updated"}
            </strong>
            <p>
              <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time> ·
              revision {event.revision}
            </p>
            {event.confirmationReference && <p>Your reference: {event.confirmationReference}</p>}
          </li>
        ))}
      </ol>
      {busy && <p role="status">Loading history…</p>}
      {cursor && (
        <button className="button secondary" disabled={busy} onClick={more}>
          Show earlier events
        </button>
      )}
      <button className="text-link" disabled={busy} onClick={() => setRetry((value) => value + 1)}>
        Refresh event history
      </button>
    </section>
  );
}
