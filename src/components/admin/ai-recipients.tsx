"use client";
import { useCallback, useEffect, useState } from "react";
import { recipientPurposes, type RecipientPage } from "@/modules/gateway/admin";
import type { RecipientClient } from "@/modules/gateway/adapters/http-client";
import { msg, useI18n } from "@/lib/i18n";
import { ApplicationError } from "@/modules/platform/errors";
import { TableScroll } from "../ui/table-scroll";

type Purpose = (typeof recipientPurposes)[number];
const failure = (error: unknown, fallback: string) =>
  error instanceof ApplicationError ? error.message : fallback;

/**
 * Reviewed AI recipients per consent version. Approval does not enable a provider; the
 * deployment routing policy and owner consent are still required for every request.
 */
export function AiRecipientAdministration({ client }: { client: RecipientClient }) {
  const { t } = useI18n();
  const [page, setPage] = useState<RecipientPage>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ purpose: "resume" as Purpose, recipient: "", reason: "" });

  const load = useCallback(
    (signal?: AbortSignal) => {
      setError("");
      return client
        .list(signal)
        .then((value) => {
          if (!signal?.aborted) setPage(value);
        })
        .catch((reason) => {
          if (!signal?.aborted) {
            setPage(undefined);
            setError(failure(reason, msg("Recipient approvals are temporarily unavailable.")));
          }
        });
    },
    [client],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function change(action: "approve" | "revoke", input: typeof draft) {
    if (busy || !input.reason.trim()) return;
    setBusy(true);
    setError("");
    try {
      await client[action](input);
      setDraft((current) => ({ ...current, recipient: "", reason: "" }));
      await load();
    } catch (reason) {
      setError(failure(reason, msg("The change could not be confirmed. Refresh before retrying.")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ai-recipients">
      <p className="muted">
        {t(
          "Approve each provider (and any reviewed upstream) for the current consent version. A new consent version starts with no approved recipients.",
        )}
      </p>
      {error && (
        <p className="notice warning" role="alert">
          {t(error)}
        </p>
      )}
      {page && (
        <TableScroll label={t("Approved AI recipients")}>
          <table>
            <thead>
              <tr>
                <th>{t("Purpose")}</th>
                <th>{t("Consent version")}</th>
                <th>{t("Recipient")}</th>
                <th>{t("Reason")}</th>
                <th>
                  <span className="sr-only">{t("Actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {page.approvals.map((item) => (
                <tr key={`${item.purpose}:${item.recipient}`}>
                  <td>{item.purpose}</td>
                  <td>{item.policyVersion}</td>
                  <td>
                    <code>{item.recipient}</code>
                  </td>
                  <td>{item.reason}</td>
                  <td>
                    <button
                      className="text-link"
                      disabled={busy || !draft.reason.trim()}
                      onClick={() =>
                        change("revoke", {
                          purpose: item.purpose,
                          recipient: item.recipient,
                          reason: draft.reason,
                        })
                      }
                    >
                      {t("Revoke")}
                    </button>
                  </td>
                </tr>
              ))}
              {!page.approvals.length && (
                <tr>
                  <td colSpan={5}>
                    {t("No recipients are approved. Model requests cannot be admitted.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableScroll>
      )}
      <form
        className="ai-recipient-form"
        onSubmit={(event) => {
          event.preventDefault();
          void change("approve", draft);
        }}
      >
        <label className="field-label">
          {t("Purpose")}
          <select
            className="text-input"
            value={draft.purpose}
            onChange={(event) => setDraft({ ...draft, purpose: event.target.value as Purpose })}
          >
            {recipientPurposes.map((purpose) => (
              <option key={purpose}>{purpose}</option>
            ))}
          </select>
        </label>
        <label className="field-label">
          {t("Recipient ID")}
          <input
            className="text-input"
            value={draft.recipient}
            pattern="[a-z][a-z0-9-]{1,30}"
            placeholder="openai"
            onChange={(event) => setDraft({ ...draft, recipient: event.target.value.trim() })}
          />
        </label>
        <label className="field-label">
          {t("Review reason (required for approve and revoke)")}
          <input
            className="text-input"
            value={draft.reason}
            maxLength={1000}
            onChange={(event) => setDraft({ ...draft, reason: event.target.value })}
          />
        </label>
        <button
          className="button primary"
          disabled={busy || !draft.recipient || !draft.reason.trim()}
        >
          {t("Approve recipient")}
        </button>
      </form>
    </div>
  );
}
