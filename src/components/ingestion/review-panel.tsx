"use client";
import { useRef, useState } from "react";
import type { ImportAdminClient } from "@/modules/ingestion/ports";
import type { ImportReview } from "@/modules/ingestion/model";
import { jobDraftSchema } from "@/modules/jobs/model";
import { courseDraftSchema } from "@/modules/learning/model";
import { msg, useI18n } from "@/lib/i18n";
import { ApplicationError } from "@/modules/platform/errors";
import { ImportDraftEditor } from "./draft-editor";
import { TableScroll } from "../ui/table-scroll";
function display(value: unknown, absent: string) {
  if (value === null || value === undefined) return absent;
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
  const { t } = useI18n();
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
          : msg("The review could not be saved. Your edits are still here."),
      );
      if (error instanceof ApplicationError && [401, 403].includes(error.status)) onDenied();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function decide(decision: "publish" | "reject" | "close" | "confirm") {
    if (!reason.trim()) {
      setError(msg("Explain this review decision before saving."));
      return;
    }
    let metadata: Record<string, unknown> | null = null;
    if (decision === "publish") {
      const parsed =
        review.kind === "jobs"
          ? jobDraftSchema.safeParse(draft)
          : courseDraftSchema.safeParse(draft);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .slice(0, 5)
          .map((issue) => `${issue.path.join(" / ")}: ${issue.message}`)
          .join("; ");
        setError(t("Check the reviewed metadata: {issues}", { issues }));
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
    setMessage(
      t("Saved {decision}. Publication reference: {id}", {
        decision: receipt.decision,
        id: receipt.id,
      }),
    );
    accept(await client.review(review.id));
    await onChanged();
  }
  return (
    <section className="panel section-block" aria-label={t("Import record review")}>
      <h3>{t("Review source record {id}", { id: row.externalId })}</h3>
      <p>
        {t("Preview {version}", { version: review.previewVersion })} · {review.state} ·{" "}
        {review.kind}
      </p>
      <p className="muted">
        {t("Source ID: {id}.", { id: review.sourceId })}{" "}
        <a href={row.url} target="_blank" rel="noreferrer">
          {t("Open original source")}
        </a>
      </p>
      {editable && !current && (
        <div className="notice" role="status">
          {t(
            "This preview needs attention: {reasons}. Rebuild a current preview before publishing. Superseded rows can only be rejected.",
            {
              reasons: [
                !review.sourceCurrent && t("source permissions or settings changed"),
                !review.dictionaryCurrent && t("skill dictionary changed"),
                !review.targetCurrent && t("catalog target changed"),
                !review.sourceLatest && t("a newer source batch supersedes this row"),
              ]
                .filter(Boolean)
                .join("; "),
            },
          )}
        </div>
      )}
      {error && (
        <p className="notice" role="alert">
          {t(error)}
        </p>
      )}
      {message && <p role="status">{t(message)}</p>}
      {review.publication && (
        <p>
          {t("Recorded decision: {decision} · reference {id}", {
            decision: review.publication.decision,
            id: review.publication.id,
          })}{" "}
          · {review.publication.createdAt}
        </p>
      )}
      <details open>
        <summary>{t("Source changes ({count})", { count: row.changes.length })}</summary>
        <TableScroll label={t("Source changes")}>
          <table>
            <thead>
              <tr>
                <th>{t("Field")}</th>
                <th>{t("Previous value")}</th>
                <th>{t("Source proposal")}</th>
              </tr>
            </thead>
            <tbody>
              {row.changes.map((change, index) => (
                <tr key={index}>
                  <th>
                    {change.field} · {change.operation}
                  </th>
                  <td style={{ overflowWrap: "anywhere" }}>
                    {display(change.before, t("Unknown / absent"))}
                  </td>
                  <td style={{ overflowWrap: "anywhere" }}>
                    {display(change.after, t("Unknown / absent"))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </details>
      {!!row.issues.length && (
        <ul>
          {row.issues.map((issue, index) => (
            <li key={index}>
              {issue.code} · {issue.field}
              {issue.blocking ? ` · ${t("needs correction")}` : ""}
            </li>
          ))}
        </ul>
      )}
      {!!row.unmappedSkills.length && (
        <p>
          {t("Unmapped source skills: {skills}. Review canonical mappings before publishing.", {
            skills: row.unmappedSkills.join(", "),
          })}
        </p>
      )}
      {editable && (
        <fieldset disabled={busy} className="profile-form-fields">
          <label>
            {t("Catalog target")}
            <select
              className="text-input"
              aria-label={t("Import catalog target")}
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
            >
              <option value="">{t("Create a separate catalog record")}</option>
              {[...new Set([...(row.targetId ? [row.targetId] : []), ...row.candidateIds])].map(
                (id) => (
                  <option key={id} value={id}>
                    {id === row.targetId ? t("Current linked record") : t("Potential duplicate")} ·{" "}
                    {id}
                  </option>
                ),
              )}
            </select>
          </label>
          <p className="muted">
            {t(
              "Choosing a target takes effect only after rebuilding the preview. Rebuilding or reloading replaces unsaved editorial edits with the new source proposal.",
            )}
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
                setMessage(msg("Rebuilt preview. Review the new differences before deciding."));
              })
            }
          >
            {t("Rebuild preview and discard unsaved edits")}
          </button>
          {row.state === "active" && (
            <details open>
              <summary>{t("Reviewed publication metadata")}</summary>
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
              {t("I reviewed the possible duplicates and intend to create a separate record.")}
            </label>
          )}
          <label>
            {t("Review decision reason")}
            <textarea
              className="text-input"
              aria-label={t("Import decision reason")}
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
                {t("Publish reviewed metadata")}
              </button>
            )}
            {row.state === "active" && row.disposition === "unchanged" && (
              <button
                type="button"
                className="button secondary"
                disabled={!current}
                onClick={() => void perform(() => decide("confirm"))}
              >
                {t("Confirm unchanged record")}
              </button>
            )}
            {row.state === "closed" && (
              <button
                type="button"
                className="button"
                disabled={!current}
                onClick={() => void perform(() => decide("close"))}
              >
                {t("Confirm explicit source closure")}
              </button>
            )}
            <button
              type="button"
              className="button secondary"
              onClick={() => void perform(() => decide("reject"))}
            >
              {t("Reject source proposal")}
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
            setMessage(msg("Reloaded saved preview; unsaved edits were discarded."));
          })
        }
      >
        {t("Reload review and discard unsaved edits")}
      </button>
    </section>
  );
}
