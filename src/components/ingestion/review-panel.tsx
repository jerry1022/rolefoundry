"use client";
import { useRef, useState } from "react";
import type { ImportAdminClient } from "@/modules/ingestion/ports";
import type { ImportReview } from "@/modules/ingestion/model";
import { jobDraftSchema } from "@/modules/jobs/model";
import { courseDraftSchema } from "@/modules/learning/model";
import { ApplicationError } from "@/modules/platform/errors";
import { ImportDraftEditor } from "./draft-editor";
function display(value: unknown) {
  if (value === null || value === undefined) return "Unknown / absent";
  return typeof value === "string" ? value : JSON.stringify(value);
}
export function ImportReviewPanel({
  initial,
  client,
  onChanged,
  onDenied,
}: {
  initial: ImportReview;
  client: ImportAdminClient;
  onChanged: () => Promise<void>;
  onDenied: () => void;
}) {
  const [review, setReview] = useState(initial),
    [draft, setDraft] = useState(initial.normalized.candidate),
    [targetId, setTargetId] = useState(initial.normalized.targetId || ""),
    [reason, setReason] = useState(""),
    [allowNew, setAllowNew] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const lock = useRef(false),
    pending = useRef<{ payload: string; key: string } | null>(null);
  const editable = ["pending", "unchanged"].includes(review.state),
    row = review.normalized,
    current =
      review.sourceCurrent &&
      review.dictionaryCurrent &&
      review.targetCurrent &&
      review.sourceLatest;
  function accept(next: ImportReview) {
    setReview(next);
    setDraft(next.normalized.candidate);
    setTargetId(next.normalized.targetId || "");
    setAllowNew(false);
  }
  async function perform(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (error) {
      setError(
        error instanceof ApplicationError
          ? error.message
          : "The review could not be saved. Your edits are still here.",
      );
      if (error instanceof ApplicationError && [401, 403].includes(error.status)) onDenied();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function decide(decision: "publish" | "reject" | "close" | "confirm") {
    if (!reason.trim()) {
      setError("Explain this review decision before saving.");
      return;
    }
    let metadata: Record<string, unknown> | null = null;
    if (decision === "publish") {
      const parsed =
        review.kind === "jobs"
          ? jobDraftSchema.safeParse(draft)
          : courseDraftSchema.safeParse(draft);
      if (!parsed.success) {
        setError(
          `Check the reviewed metadata: ${parsed.error.issues
            .slice(0, 5)
            .map((issue) => `${issue.path.join(" / ")}: ${issue.message}`)
            .join("; ")}`,
        );
        return;
      }
      metadata = parsed.data;
    }
    const input = {
        expectedRevision: review.revision,
        decision,
        draft: metadata,
        reason: reason.trim(),
        allowNewDuplicate: allowNew,
      },
      payload = JSON.stringify(input);
    if (pending.current?.payload !== payload)
      pending.current = { payload, key: crypto.randomUUID() };
    const receipt = await client.decide(review.id, input, pending.current.key);
    pending.current = null;
    // A saved decision is acknowledged before refreshing; a refresh failure never suggests retrying publication blindly.
    setMessage(`Saved ${receipt.decision}. Publication reference: ${receipt.id}`);
    accept(await client.review(review.id));
    await onChanged();
  }
  return (
    <section className="panel section-block" aria-label="Import record review">
      <h3>Review source record {row.externalId}</h3>
      <p>
        Preview {review.previewVersion} · {review.state} · {review.kind}
      </p>
      <p className="muted">
        Source ID: {review.sourceId}.{" "}
        <a href={row.url} target="_blank" rel="noreferrer">
          Open original source
        </a>
      </p>
      {editable && !current && (
        <div className="notice" role="status">
          This preview needs attention:{" "}
          {[
            !review.sourceCurrent && "source permissions or settings changed",
            !review.dictionaryCurrent && "skill dictionary changed",
            !review.targetCurrent && "catalog target changed",
            !review.sourceLatest && "a newer source batch supersedes this row",
          ]
            .filter(Boolean)
            .join("; ")}
          . Rebuild a current preview before publishing. Superseded rows can only be rejected.
        </div>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {review.publication && (
        <p>
          Recorded decision: {review.publication.decision} · reference {review.publication.id} ·{" "}
          {review.publication.createdAt}
        </p>
      )}
      <details open>
        <summary>Source changes ({row.changes.length})</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Field</th>
                <th>Previous value</th>
                <th>Source proposal</th>
              </tr>
            </thead>
            <tbody>
              {row.changes.map((change, index) => (
                <tr key={index}>
                  <th>
                    {change.field} · {change.operation}
                  </th>
                  <td style={{ overflowWrap: "anywhere" }}>{display(change.before)}</td>
                  <td style={{ overflowWrap: "anywhere" }}>{display(change.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {!!row.issues.length && (
        <ul>
          {row.issues.map((issue, index) => (
            <li key={index}>
              {issue.code} · {issue.field}
              {issue.blocking ? " · needs correction" : ""}
            </li>
          ))}
        </ul>
      )}
      {!!row.unmappedSkills.length && (
        <p>
          Unmapped source skills: {row.unmappedSkills.join(", ")}. Review canonical mappings before
          publishing.
        </p>
      )}
      {editable && (
        <fieldset disabled={busy} className="profile-form-fields">
          <label>
            Catalog target
            <select
              className="text-input"
              aria-label="Import catalog target"
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
            >
              <option value="">Create a separate catalog record</option>
              {[...new Set([...(row.targetId ? [row.targetId] : []), ...row.candidateIds])].map(
                (id) => (
                  <option key={id} value={id}>
                    {id === row.targetId ? "Current linked record" : "Potential duplicate"} · {id}
                  </option>
                ),
              )}
            </select>
          </label>
          <p className="muted">
            Choosing a target takes effect only after rebuilding the preview. Rebuilding or
            reloading replaces unsaved editorial edits with the new source proposal.
          </p>
          <button
            type="button"
            className="button secondary"
            disabled={!review.sourceLatest}
            onClick={() =>
              void perform(async () => {
                accept(
                  await client.rebase(review.id, {
                    expectedRevision: review.revision,
                    targetId: targetId || null,
                  }),
                );
                setMessage("Rebuilt preview. Review the new differences before deciding.");
              })
            }
          >
            Rebuild preview and discard unsaved edits
          </button>
          {row.state === "active" && (
            <details open>
              <summary>Reviewed publication metadata</summary>
              <ImportDraftEditor kind={review.kind} draft={draft} onChange={setDraft} />
            </details>
          )}
          {row.candidateIds.length > 0 && row.targetId === null && (
            <label>
              <input
                type="checkbox"
                checked={allowNew}
                onChange={(event) => setAllowNew(event.target.checked)}
              />
              I reviewed the possible duplicates and intend to create a separate record.
            </label>
          )}
          <label>
            Review decision reason
            <textarea
              className="text-input"
              aria-label="Import decision reason"
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <div className="button-row">
            {row.state === "active" && (
              <button
                type="button"
                className="button"
                disabled={!current || targetId !== (row.targetId || "")}
                onClick={() => void perform(() => decide("publish"))}
              >
                Publish reviewed metadata
              </button>
            )}
            {row.state === "active" && row.disposition === "unchanged" && (
              <button
                type="button"
                className="button secondary"
                disabled={!current}
                onClick={() => void perform(() => decide("confirm"))}
              >
                Confirm unchanged record
              </button>
            )}
            {row.state === "closed" && (
              <button
                type="button"
                className="button"
                disabled={!current}
                onClick={() => void perform(() => decide("close"))}
              >
                Confirm explicit source closure
              </button>
            )}
            <button
              type="button"
              className="button secondary"
              onClick={() => void perform(() => decide("reject"))}
            >
              Reject source proposal
            </button>
          </div>
        </fieldset>
      )}
      <button
        type="button"
        className="button secondary"
        disabled={busy}
        onClick={() =>
          void perform(async () => {
            accept(await client.review(review.id));
            setMessage("Reloaded saved preview; unsaved edits were discarded.");
          })
        }
      >
        Reload review and discard unsaved edits
      </button>
    </section>
  );
}
