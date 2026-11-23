"use client";
import { useEffect, useRef, useState } from "react";
import { ApplicationError } from "@/modules/platform/errors";
import {
  replayReasonSchema,
  type ReplayInput,
  type ReplayPreview,
  type TaskReplayClient,
} from "@/modules/operations/replay";
const messages: Record<NonNullable<ReplayPreview["reason"]>, string> = {
  "already-replayed": "A new attempt already exists. Inspect it before taking further action.",
  "not-terminal": "Only a failed task without a committed result can be recovered here.",
  permanent: "This failure needs a new owner request or domain correction; it cannot be replayed.",
  "owner-unavailable": "The original account is unavailable. Its private work cannot restart.",
  "source-stale":
    "The accepted input, source permission or version is no longer valid. Use the current domain workflow.",
  limit: "The original request has reached its recovery or pending-work limit.",
  "deployment-unavailable": "This deployment no longer approves the original feed definition.",
};
/** No read creates work. The pending mutation identity survives a lost response. */
export function TaskReplayControl({
  taskId,
  client,
  onInspect,
  onUnavailable,
}: {
  taskId: string;
  client: TaskReplayClient;
  onInspect: (id: string) => void;
  onUnavailable?: (error: ApplicationError) => void;
}) {
  const [preview, setPreview] = useState<ReplayPreview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reason, setReason] = useState<ReplayInput["reason"]>("operator-reviewed"),
    [attempted, setAttempted] = useState(false);
  const mounted = useRef(false),
    lock = useRef(false),
    pending = useRef<ReplayInput | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function perform(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (error) {
      if (
        mounted.current &&
        error instanceof ApplicationError &&
        [401, 403, 404].includes(error.status)
      )
        onUnavailable?.(error);
      if (mounted.current)
        setError(
          error instanceof ApplicationError
            ? error.message
            : "Task recovery is temporarily unavailable. Retry the same operation.",
        );
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function inspect() {
    const value = await client.preview(taskId);
    if (!mounted.current) return;
    setPreview(value);
    if (!value.available) {
      pending.current = null;
      setAttempted(false);
    }
  }
  async function replay() {
    pending.current ??= { requestId: crypto.randomUUID(), reason };
    setAttempted(true);
    const result = await client.request(taskId, pending.current);
    if (!mounted.current) return;
    setPreview({ available: false, reason: "already-replayed", nextTaskId: result.taskId });
    pending.current = null;
    setAttempted(false);
  }
  return (
    <section className="section-block" aria-label="Task recovery">
      <h4>Recover a failed task</h4>
      <p>
        Recovery validates the original request and creates a new execution. Its previous history
        stays available. Review the service issue before requesting recovery.
      </p>
      {error && <p role="alert">{error}</p>}
      <button className="button secondary" disabled={busy} onClick={() => void perform(inspect)}>
        Check recovery eligibility
      </button>
      {preview?.reason && <p role="status">{messages[preview.reason]}</p>}
      {preview?.nextTaskId && (
        <>
          <p>New attempt: {preview.nextTaskId}</p>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => onInspect(preview.nextTaskId!)}
          >
            Inspect recovered attempt
          </button>
        </>
      )}
      {preview?.available && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void perform(replay);
          }}
        >
          <label className="field">
            Recovery reason
            <select
              className="text-input"
              aria-label="Task recovery reason"
              value={reason}
              disabled={busy || attempted}
              onChange={(event) => setReason(replayReasonSchema.parse(event.target.value))}
            >
              <option value="operator-reviewed">Operator reviewed</option>
              <option value="configuration-restored">Configuration restored</option>
              <option value="storage-restored">Storage restored</option>
              <option value="directory-restored">Directory restored</option>
            </select>
          </label>
          <button className="button primary" disabled={busy}>
            {busy
              ? "Requesting recovery…"
              : attempted
                ? "Retry this recovery request"
                : "Create new task attempt"}
          </button>
        </form>
      )}
    </section>
  );
}
