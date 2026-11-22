"use client";
import { useEffect, useRef, useState } from "react";
import type { DeletionClient } from "@/modules/account-deletion/ports";
import {
  deletionReceiptSchema,
  type DeletionReceipt,
  type DeletionStatus,
} from "@/modules/account-deletion/model";
import { ApplicationError } from "@/modules/platform/errors";
function message(error: unknown) {
  return error instanceof ApplicationError
    ? error.message
    : "Account removal is temporarily unavailable. Keep your receipt and check again.";
}
function receipt() {
  return {
    id: crypto.randomUUID(),
    secret: Array.from(crypto.getRandomValues(new Uint8Array(32)), (value) =>
      value.toString(16).padStart(2, "0"),
    ).join(""),
  };
}
export function DeletionRequest({
  client,
  onAccepted,
}: {
  client: DeletionClient;
  onAccepted: (receipt: DeletionReceipt) => void;
}) {
  const [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<DeletionReceipt | null>(null),
    lock = useRef(false);
  return (
    <section
      className="panel section-block account-deletion-workspace"
      aria-label="Delete your account"
    >
      <h2>Delete your account</h2>
      <p>
        This permanently removes your private career records, resume files and sign-in account.
        Access stops as soon as the request is accepted; file and account cleanup continue
        afterward.
      </p>
      <p>
        Download anything you want to keep first. Your stored account archives will also be removed.
        Minimal operational records and deletion markers remain; backup copies follow their
        retention policy.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          setError("");
          pending.current ??= receipt();
          const current = pending.current;
          void client
            .request({ ...current, confirmation: "DELETE" })
            .then(() => onAccepted(current))
            .catch((error) => setError(message(error)))
            .finally(() => {
              lock.current = false;
              setBusy(false);
            });
        }}
      >
        <label className="field-label">
          Type DELETE to confirm
          <input
            className="text-input"
            aria-label="Account deletion confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            required
            pattern="DELETE"
          />
        </label>
        <button className="button secondary" disabled={busy || confirmation !== "DELETE"}>
          Permanently delete my account
        </button>
      </form>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
    </section>
  );
}
export function DeletionProgress({
  client,
  receipt,
}: {
  client: DeletionClient;
  receipt: DeletionReceipt;
}) {
  const [status, setStatus] = useState<DeletionStatus | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const generation = useRef(0);
  async function refresh() {
    const current = ++generation.current;
    setBusy(true);
    try {
      const value = await client.status(receipt);
      if (current === generation.current) {
        setStatus(value);
        setError("");
      }
    } catch (error) {
      if (current === generation.current) setError(message(error));
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    let stopped = false,
      timer: ReturnType<typeof setTimeout> | undefined,
      count = 0;
    const poll = async () => {
      const current = ++generation.current;
      try {
        const value = await client.status(receipt);
        if (stopped) return;
        if (current === generation.current) {
          setStatus(value);
          setError("");
          if (["completed", "needs-attention"].includes(value.status)) return;
        }
      } catch (error) {
        if (!stopped && current === generation.current) setError(message(error));
      }
      if (!stopped && ++count < 40)
        timer = setTimeout(poll, Math.min(2000 * 2 ** Math.floor(count / 5), 15000));
    };
    void poll();
    return () => {
      stopped = true;
      generation.current++;
      clearTimeout(timer);
    };
  }, [client, receipt]);
  return (
    <section
      className="panel section-block account-deletion-workspace"
      aria-label="Account deletion progress"
    >
      <h2>Account removal request</h2>
      <p>
        Private account access is disabled. Keep the receipt below to check progress after closing
        this page.
      </p>
      <p>Request {receipt.id}</p>
      {status ? (
        <>
          <p role="status">Removal status: {status.status}</p>
          {status.failures > 0 && status.status !== "completed" && (
            <p>
              {status.failures} service failure(s) recorded. Temporary failures retry automatically.
            </p>
          )}
          {status.retryAt && status.status !== "completed" && (
            <p>
              Next attempt no earlier than{" "}
              {new Date(status.retryAt).toLocaleString("en", { timeZone: "UTC" })} UTC.
            </p>
          )}
          {status.status === "completed" && (
            <p>
              Your sign-in account, private career records and live files have been removed.
              Previously downloaded files cannot be recalled; retained backups follow their expiry
              policy.
            </p>
          )}
          {status.status === "needs-attention" && (
            <p>
              An operator must review this request. Share the request identifier with support; keep
              the private receipt secret.
            </p>
          )}
        </>
      ) : (
        <p role="status">Checking removal progress…</p>
      )}
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      <div className="button-row">
        <button className="button secondary" disabled={busy} onClick={() => void refresh()}>
          Refresh deletion progress
        </button>
        <button
          className="button secondary"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([`${receipt.id}.${receipt.secret}\n`], { type: "text/plain" }),
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = "rolefoundry-deletion-receipt.txt";
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Save deletion receipt
        </button>
      </div>
    </section>
  );
}
export function DeletionReceiptCheck({ client }: { client: DeletionClient }) {
  const [value, setValue] = useState(""),
    [current, setCurrent] = useState<DeletionReceipt | null>(null),
    [error, setError] = useState("");
  return (
    <details className="panel section-block account-deletion-workspace">
      <summary>Check an existing deletion receipt</summary>
      <p>
        Paste the code from your saved receipt. It reveals progress only and never restores account
        access.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const [id, secret, ...extra] = value.trim().split(".");
          const parsed = deletionReceiptSchema.safeParse({ id, secret });
          if (!parsed.success || extra.length) {
            setError("Check the saved receipt code.");
            return;
          }
          setError("");
          setCurrent(parsed.data);
          setValue("");
        }}
      >
        <label className="field-label">
          Private deletion receipt
          <input
            className="text-input"
            type="password"
            autoComplete="off"
            value={value}
            maxLength={101}
            required
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <button className="button secondary">Check deletion receipt</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {current && (
        <DeletionProgress key={current.id + current.secret} client={client} receipt={current} />
      )}
    </details>
  );
}
