"use client";
import { useEffect, useRef, useState } from "react";
import type { DeletionAdminClient } from "@/modules/account-deletion/ports";
import {
  resumeReasonSchema,
  type DeletionStatus,
  type ResumeReason,
} from "@/modules/account-deletion/model";
import { ApplicationError } from "@/modules/platform/errors";
import { msg, useI18n } from "@/lib/i18n";
export function DeletionAdministration({
  client,
  isAdmin,
}: {
  client: DeletionAdminClient;
  isAdmin: () => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [allowed, setAllowed] = useState(false),
    [task, setTask] = useState(""),
    [id, setId] = useState(""),
    [reason, setReason] = useState<ResumeReason>("operator-reviewed"),
    [status, setStatus] = useState<DeletionStatus | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    let present = true;
    void isAdmin()
      .then((value) => {
        if (present) setAllowed(value);
      })
      .catch(() => {});
    return () => {
      present = false;
    };
  }, [isAdmin]);
  async function run(work: () => Promise<DeletionStatus>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await work();
      setStatus(result);
      setId(result.id);
    } catch (error) {
      setError(
        error instanceof ApplicationError
          ? error.message
          : msg("Account removal recovery is unavailable."),
      );
      if (error instanceof ApplicationError && [401, 403].includes(error.status)) {
        setAllowed(false);
        setStatus(null);
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <details
      className="panel section-block account-deletion-workspace"
      aria-label={t("Account deletion recovery")}
    >
      <summary>{t("Account deletion recovery")}</summary>
      {allowed ? (
        <>
          <p>
            {t(
              "Recover an already accepted deletion request after reviewing its failed task. Resume creates an audited new attempt; it cannot initiate deletion for another account.",
            )}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => client.find(task));
            }}
          >
            <label className="field-label">
              {t("Deletion task identifier")}
              <input
                className="text-input"
                value={task}
                required
                maxLength={36}
                onChange={(event) => setTask(event.target.value)}
              />
            </label>
            <button className="button secondary" disabled={busy}>
              {t("Find deletion request")}
            </button>
          </form>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => client.resume(id, reason));
            }}
          >
            <label className="field-label">
              {t("Deletion request identifier")}
              <input
                className="text-input"
                value={id}
                required
                maxLength={36}
                onChange={(event) => setId(event.target.value)}
              />
            </label>
            <label className="field-label">
              {t("Recovery reason")}
              <select
                className="text-input"
                value={reason}
                onChange={(event) => setReason(event.target.value as ResumeReason)}
              >
                {resumeReasonSchema.options.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <button className="button secondary" disabled={busy}>
              {t("Resume failed account deletion")}
            </button>
          </form>
          {status && (
            <p role="status">
              {t("Request {id} · {status}", { id: status.id, status: status.status })}
            </p>
          )}
        </>
      ) : (
        <p>{t("Account deletion recovery requires an administrator session.")}</p>
      )}
      {error && (
        <p role="alert" className="notice">
          {t(error)}
        </p>
      )}
    </details>
  );
}
