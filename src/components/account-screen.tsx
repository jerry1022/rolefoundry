"use client";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { CheckCircle2, LogOut, Mail, ShieldCheck } from "lucide-react";
import {
  actorSchema,
  consentSchema,
  policySchema,
  usageSchema,
  utcWeekStart,
  type Actor,
  type AnalysisFeature,
} from "@/modules/identity/core";

const enabled = process.env.NEXT_PUBLIC_IDENTITY_ENABLED === "true";
const base = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/v1/identity`;
class AccountRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
async function request(path: string, method = "GET", data?: unknown) {
  const response = await fetch(`${base}/${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    ...(data === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  });
  const result = await response.json();
  if (!response.ok)
    throw new AccountRequestError(
      response.status,
      result.error?.message || "The request could not be completed.",
    );
  return result.data;
}
type Policy = z.infer<typeof policySchema>;
type Consent = z.infer<typeof consentSchema>;
type Usage = z.infer<typeof usageSchema>;

export function AccountScreen() {
  const [actor, setActor] = useState<Actor | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [consents, setConsents] = useState<Consent[]>([]);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDate, setInviteDate] = useState(() =>
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  );
  const [feature, setFeature] = useState<AnalysisFeature>("assessment");
  const [limit, setLimit] = useState(3);
  const [effectiveDate, setEffectiveDate] = useState(() =>
    new Date(utcWeekStart(new Date()).getTime() + 7 * 86400000).toISOString().slice(0, 10),
  );
  const [refundTask, setRefundTask] = useState("");
  const [refundReason, setRefundReason] = useState("");

  async function refresh() {
    const currentPolicies = z.array(policySchema).parse(await request("policies"));
    setPolicies(currentPolicies);
    try {
      const currentActor = actorSchema.parse(await request("session"));
      const [currentConsents, currentUsage] = await Promise.all([
        request("consents"),
        request("usage"),
      ]);
      setActor(currentActor);
      setConsents(z.array(consentSchema).parse(currentConsents));
      setUsage(z.array(usageSchema).parse(currentUsage));
    } catch (failure) {
      setActor(null);
      setConsents([]);
      setUsage([]);
      if (!(failure instanceof AccountRequestError && failure.status === 401)) throw failure;
    }
  }
  useEffect(() => {
    if (enabled)
      refresh()
        .catch((failure) =>
          setError(failure instanceof Error ? failure.message : "Unable to load your account."),
        )
        .finally(() => setLoading(false));
  }, []);
  async function run(operation: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await operation();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The request could not be completed.");
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent, operation: () => Promise<void>) {
    event.preventDefault();
    void run(operation);
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR ACCOUNT, YOUR CHOICE</p>
          <h1>Account &amp; privacy.</h1>
          <p className="page-description">
            Invitation-only sign-in, explicit analysis consent and a clear view of your weekly
            limits.
          </p>
        </div>
      </div>
      {!enabled ? (
        <section className="panel account-demo">
          <ShieldCheck size={30} />
          <h2>You&apos;re exploring the local demo.</h2>
          <p>
            This static demo does not connect to an identity service. Your workspace remains in this
            browser.
          </p>
          <p>
            Email sign-in and account controls are available in configured server deployments. See
            the repository&apos;s identity setup guide to run them locally.
          </p>
          <a
            className="text-link"
            href="https://github.com/jerry1022/rolefoundry/blob/main/docs/IDENTITY_SETUP.md"
            target="_blank"
            rel="noreferrer"
          >
            Identity setup guide
          </a>
        </section>
      ) : (
        <>
          <div className="notice inline">
            <ShieldCheck size={18} />
            <span>
              Sign-in protects your server account APIs. The other workspace pages still use
              browser-local demo data; signing in does not upload or merge that data.
            </span>
          </div>
          {error && (
            <div className="notice warning" role="alert">
              {error}
            </div>
          )}
          {message && (
            <div className="notice" role="status">
              {message}
            </div>
          )}
          {loading ? (
            <section className="panel" aria-live="polite">
              Loading your account…
            </section>
          ) : !actor ? (
            <section className="panel account-signin">
              <span className="large-icon">
                <Mail size={24} />
              </span>
              <h2>Sign in with an invitation.</h2>
              <p className="muted">
                Use your invited email address. Enter the code from your email to continue.
              </p>
              <form
                onSubmit={(event) =>
                  submit(event, async () => {
                    const result = await request("signin", "POST", { email });
                    setMessage(result.message);
                    setCodeSent(true);
                  })
                }
              >
                <label className="field-label">
                  Email address
                  <input
                    className="text-input"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setCodeSent(false);
                      setCode("");
                    }}
                  />
                </label>
                <button className="button primary" disabled={busy || !email} type="submit">
                  {codeSent ? "Request another code" : "Send sign-in code"}
                </button>
              </form>
              {codeSent && (
                <form
                  onSubmit={(event) =>
                    submit(event, async () => {
                      await request("verify", "POST", { email, code });
                      setCode("");
                      await refresh();
                      setMessage("You are signed in.");
                    })
                  }
                >
                  <label className="field-label">
                    Sign-in code
                    <input
                      className="text-input"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6,10}"
                      required
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                    />
                  </label>
                  <button className="button primary" disabled={busy} type="submit">
                    Verify and sign in
                  </button>
                </form>
              )}
            </section>
          ) : (
            <>
              <section className="panel account-session">
                <span className="stat-icon mint">
                  <CheckCircle2 size={20} />
                </span>
                <div>
                  <h2>Signed in as a {actor.role}</h2>
                  <p className="muted">
                    Account {actor.userId.slice(0, 8)} · verified server session
                  </p>
                </div>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await request("signout", "POST", {});
                      setActor(null);
                      setConsents([]);
                      setUsage([]);
                      setEmail("");
                      setCodeSent(false);
                      setMessage("You have signed out of this device.");
                    })
                  }
                >
                  <LogOut size={15} />
                  Sign out
                </button>
              </section>
              <section className="panel section-block">
                <h2>Analysis permissions</h2>
                <p className="muted account-intro">
                  Choose separately for each purpose. Revoking permission cancels queued work and
                  prevents an in-progress result from being published. This page does not run an AI
                  analysis.
                </p>
                <div className="account-consents">
                  {policies.map((policy) => {
                    const granted = consents.some(
                      (item) =>
                        item.purpose === policy.purpose && item.policyVersion === policy.version,
                    );
                    return (
                      <article key={policy.purpose} className="account-consent">
                        <span className="pill">
                          {granted ? "Permission granted" : "No current permission"}
                        </span>
                        <h3>
                          {policy.purpose === "assessment"
                            ? "Assessment analysis"
                            : "Resume analysis"}
                        </h3>
                        <p>{policy.description}</p>
                        <small>Policy version {policy.version}</small>
                        <button
                          className={`button ${granted ? "secondary" : "primary"}`}
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await request(
                                "consents",
                                granted ? "DELETE" : "POST",
                                granted
                                  ? { purpose: policy.purpose }
                                  : { purpose: policy.purpose, policyVersion: policy.version },
                              );
                              await refresh();
                              setMessage(
                                granted
                                  ? "Permission revoked. A provider call already in progress cannot be recalled, but its result cannot be published after revocation."
                                  : "Your permission has been recorded for this policy version.",
                              );
                            })
                          }
                        >
                          {granted ? "Revoke permission" : "I agree to this policy"}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
              <section className="panel section-block">
                <h2>Weekly analysis allowance</h2>
                <div className="account-usage">
                  {usage.map((item) => (
                    <article className="stat-card" key={item.feature}>
                      <span className="mini-label">{item.feature} analysis</span>
                      <strong className="stat-number">
                        {Math.max(0, item.limit - item.reserved - item.consumed)}
                        <small> / {item.limit} remaining</small>
                      </strong>
                      <p>
                        {item.reserved} reserved · {item.consumed} consumed
                      </p>
                      <p>Resets Monday 00:00 UTC</p>
                    </article>
                  ))}
                </div>
              </section>
              {actor.role === "admin" && (
                <section className="panel section-block">
                  <h2>Administrator controls</h2>
                  <div className="account-admin-grid">
                    <form
                      onSubmit={(event) =>
                        submit(event, async () => {
                          await request("admin/invitations", "POST", {
                            email: inviteEmail,
                            expiresAt: `${inviteDate}T23:59:59.000Z`,
                          });
                          setInviteEmail("");
                          setMessage(
                            "Invitation added. The recipient can sign in with their email before it expires.",
                          );
                        })
                      }
                    >
                      <h3>Invite a member</h3>
                      <label className="field-label">
                        Invite email
                        <input
                          type="email"
                          className="text-input"
                          required
                          value={inviteEmail}
                          onChange={(event) => setInviteEmail(event.target.value)}
                        />
                      </label>
                      <label className="field-label">
                        Invitation expires (UTC)
                        <input
                          type="date"
                          className="text-input"
                          required
                          value={inviteDate}
                          onChange={(event) => setInviteDate(event.target.value)}
                        />
                      </label>
                      <button className="button primary" disabled={busy}>
                        Add invitation
                      </button>
                    </form>
                    <form
                      onSubmit={(event) =>
                        submit(event, async () => {
                          await request("admin/quota-policies", "POST", {
                            feature,
                            limit,
                            effectiveFrom: `${effectiveDate}T00:00:00.000Z`,
                          });
                          setMessage("Quota policy scheduled. Existing usage remains unchanged.");
                        })
                      }
                    >
                      <h3>Schedule a future quota</h3>
                      <label className="field-label">
                        Analysis feature
                        <select
                          className="text-input"
                          value={feature}
                          onChange={(event) => setFeature(event.target.value as AnalysisFeature)}
                        >
                          <option value="assessment">Assessment</option>
                          <option value="resume">Resume</option>
                        </select>
                      </label>
                      <label className="field-label">
                        Weekly limit
                        <input
                          type="number"
                          min={0}
                          max={10000}
                          className="text-input"
                          required
                          value={limit}
                          onChange={(event) => setLimit(Number(event.target.value))}
                        />
                      </label>
                      <label className="field-label">
                        Effective Monday (UTC)
                        <input
                          type="date"
                          className="text-input"
                          required
                          value={effectiveDate}
                          onChange={(event) => setEffectiveDate(event.target.value)}
                        />
                      </label>
                      <button className="button primary" disabled={busy}>
                        Schedule quota
                      </button>
                    </form>
                    <form
                      onSubmit={(event) =>
                        submit(event, async () => {
                          await request("admin/refunds", "POST", {
                            taskId: refundTask,
                            reason: refundReason,
                          });
                          setRefundTask("");
                          setRefundReason("");
                          await refresh();
                          setMessage(
                            "The infrastructure-failure refund was recorded in the audit log.",
                          );
                        })
                      }
                    >
                      <h3>Refund failed analysis</h3>
                      <p className="muted">
                        Only consumed analyses that failed because of infrastructure are eligible.
                      </p>
                      <label className="field-label">
                        Task ID
                        <input
                          className="text-input"
                          required
                          value={refundTask}
                          onChange={(event) => setRefundTask(event.target.value)}
                        />
                      </label>
                      <label className="field-label">
                        Refund reason
                        <textarea
                          className="text-input"
                          required
                          maxLength={1000}
                          value={refundReason}
                          onChange={(event) => setRefundReason(event.target.value)}
                        />
                      </label>
                      <button className="button secondary" disabled={busy}>
                        Record audited refund
                      </button>
                    </form>
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
