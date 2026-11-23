"use client";
import { useEffect, useRef, useState } from "react";
import type { IdentityAdminClient, InvitationPage, QuotaPage } from "@/modules/identity/admin";
import { featureSchema, utcWeekStart, type AnalysisFeature } from "@/modules/identity/core";
import { ApplicationError } from "@/modules/platform/errors";
export function IdentityAdministration({
  client,
  onChanged,
  onUnavailable,
}: {
  client: IdentityAdminClient;
  onChanged?: () => Promise<void>;
  onUnavailable?: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [invitations, setInvitations] = useState<InvitationPage | null>(null),
    [policies, setPolicies] = useState<QuotaPage | null>(null);
  const [inviteEmail, setInviteEmail] = useState(""),
    [inviteDate, setInviteDate] = useState(() =>
      new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    );
  const [feature, setFeature] = useState<AnalysisFeature>("assessment"),
    [limit, setLimit] = useState("3"),
    [effectiveDate, setEffectiveDate] = useState(() =>
      new Date(utcWeekStart(new Date()).getTime() + 7 * 86400000).toISOString().slice(0, 10),
    );
  const [refundTask, setRefundTask] = useState(""),
    [refundReason, setRefundReason] = useState("");
  const mounted = useRef(false),
    lock = useRef(false),
    generation = useRef(0);
  function failed(error: unknown) {
    if (!mounted.current) return;
    setError(
      error instanceof ApplicationError
        ? error.message
        : "Identity administration is temporarily unavailable.",
    );
    if (error instanceof ApplicationError && [401, 403].includes(error.status)) {
      generation.current++;
      setInvitations(null);
      setPolicies(null);
      onUnavailable?.();
    }
  }
  async function reload() {
    const current = ++generation.current;
    const [nextInvitations, nextPolicies] = await Promise.all([
      client.invitations(),
      client.quotaPolicies(),
    ]);
    if (mounted.current && current === generation.current) {
      setInvitations(nextInvitations);
      setPolicies(nextPolicies);
    }
  }
  useEffect(() => {
    mounted.current = true;
    void reload().catch(failed);
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, [client]);
  async function perform(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (error) {
      failed(error);
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function changed() {
    await reload();
    await onChanged?.();
  }
  return (
    <section aria-label="Identity administration" className="section-block">
      <h2>Administrator controls</h2>
      <p>
        Manage unused invitations and future weekly allowances. Refunding an eligible infrastructure
        failure records an audit reason.
      </p>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <div className="account-admin-grid">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void perform(async () => {
              const receipt = await client.invite({
                email: inviteEmail,
                expiresAt: `${inviteDate}T23:59:59.000Z`,
              });
              if (mounted.current) {
                setInviteEmail("");
                setMessage(
                  `Invitation ${receipt.id} saved. The recipient can sign in before ${receipt.expiresAt}.`,
                );
              }
              await changed();
            });
          }}
        >
          <fieldset className="profile-form-fields" disabled={busy}>
            <h3>Invite a member</h3>
            <label>
              Invite email
              <input
                type="email"
                className="text-input"
                required
                maxLength={254}
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
              />
            </label>
            <label>
              Invitation expires (UTC)
              <input
                type="date"
                className="text-input"
                required
                value={inviteDate}
                onChange={(event) => setInviteDate(event.target.value)}
              />
            </label>
            <button className="button primary">Add invitation</button>
          </fieldset>
        </form>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void perform(async () => {
              const result = await client.scheduleQuota({
                feature,
                limit: Number(limit),
                effectiveFrom: `${effectiveDate}T00:00:00.000Z`,
              });
              if (mounted.current)
                setMessage(
                  `Quota policy scheduled for ${feature} from ${result.effectiveFrom}. Existing usage stays unchanged.`,
                );
              await changed();
            });
          }}
        >
          <fieldset className="profile-form-fields" disabled={busy}>
            <h3>Schedule a future quota</h3>
            <label>
              Analysis feature
              <select
                className="text-input"
                value={feature}
                onChange={(event) => setFeature(featureSchema.parse(event.target.value))}
              >
                <option value="assessment">Assessment</option>
                <option value="resume">Resume</option>
              </select>
            </label>
            <label>
              Weekly limit
              <input
                type="number"
                min={0}
                max={10000}
                className="text-input"
                required
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
              />
            </label>
            <label>
              Effective Monday (UTC)
              <input
                type="date"
                className="text-input"
                required
                value={effectiveDate}
                onChange={(event) => setEffectiveDate(event.target.value)}
              />
            </label>
            <button className="button primary">Schedule quota</button>
          </fieldset>
        </form>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void perform(async () => {
              await client.refund({ taskId: refundTask, reason: refundReason });
              if (mounted.current) {
                setRefundTask("");
                setRefundReason("");
                setMessage("The infrastructure-failure refund was recorded in the audit log.");
              }
              await changed();
            });
          }}
        >
          <fieldset className="profile-form-fields" disabled={busy}>
            <h3>Refund failed analysis</h3>
            <p>Only consumed analyses that failed because of infrastructure are eligible.</p>
            <label>
              Task ID
              <input
                className="text-input"
                required
                maxLength={36}
                value={refundTask}
                onChange={(event) => setRefundTask(event.target.value)}
              />
            </label>
            <label>
              Refund reason
              <textarea
                className="text-input"
                required
                maxLength={1000}
                value={refundReason}
                onChange={(event) => setRefundReason(event.target.value)}
              />
            </label>
            <button className="button secondary">Record audited refund</button>
          </fieldset>
        </form>
      </div>
      <button className="button secondary" disabled={busy} onClick={() => void perform(reload)}>
        Refresh invitations and quota policies
      </button>
      <section className="panel section-block" aria-label="Invitation records">
        <h3>Invitation records</h3>
        <p>
          Records show identifiers and expiry only. Invitation email addresses and hashes are not
          returned.
        </p>
        {invitations?.data.map((invitation) => (
          <article key={invitation.id} className="section-block">
            <strong>{invitation.id}</strong>
            <p>
              {invitation.status} · expires {invitation.expiresAt}
            </p>
            {invitation.status === "available" && (
              <button
                className="button secondary"
                disabled={busy}
                aria-label={`Revoke unused invitation ${invitation.id}`}
                onClick={() =>
                  void perform(async () => {
                    await client.revokeInvitation(invitation.id);
                    await changed();
                    if (mounted.current)
                      setMessage(
                        "Unused invitation revoked. This does not deactivate a signed-in account.",
                      );
                  })
                }
              >
                Revoke unused invitation
              </button>
            )}
          </article>
        ))}
        {invitations?.data.length === 0 && <p>No invitations.</p>}
        {invitations?.nextCursor && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                const current = generation.current,
                  next = await client.invitations(invitations.nextCursor!);
                if (mounted.current && generation.current === current)
                  setInvitations({ ...next, data: [...invitations.data, ...next.data] });
              })
            }
          >
            Load older invitations
          </button>
        )}
      </section>
      <section className="panel section-block" aria-label="Quota policy records">
        <h3>Quota policy records</h3>
        <p>
          Changes begin on a future Monday at 00:00 UTC. Reusing a future feature/date updates that
          unused policy through the same audited service.
        </p>
        {policies?.data.map((policy) => (
          <article key={policy.id} className="section-block">
            <strong>
              {policy.feature}: {policy.limit} per week
            </strong>
            <p>
              From {policy.effectiveFrom} · policy {policy.id}
            </p>
          </article>
        ))}
        {policies?.nextCursor && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                const current = generation.current,
                  next = await client.quotaPolicies(policies.nextCursor!);
                if (mounted.current && generation.current === current)
                  setPolicies({ ...next, data: [...policies.data, ...next.data] });
              })
            }
          >
            Load older quota policies
          </button>
        )}
      </section>
    </section>
  );
}
