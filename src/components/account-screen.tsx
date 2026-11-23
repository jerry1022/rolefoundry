"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  DeletionRequestEntry,
  DeletionProgressEntry,
  DeletionReceiptEntry,
} from "./account-deletion/entry";
import type { DeletionReceipt } from "@/modules/account-deletion/model";
import { AccountDataEntry } from "./account-data/entry";
import { IdentityAdministration } from "./identity/administration";
import { createIdentityAdminClient } from "@/modules/identity/adapters/admin-client";
import { z } from "zod";
import { CheckCircle2, LogOut, Mail, ShieldCheck } from "lucide-react";
import {
  actorSchema,
  consentSchema,
  policySchema,
  usageSchema,
  type Actor,
} from "@/modules/identity/core";

const identityAdminClient = createIdentityAdminClient();
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
  const [deletionReceipt, setDeletionReceipt] = useState<DeletionReceipt | null>(null);
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
              Sign-in protects your private career data. Browser-local demo data is imported only
              through an explicit reviewed action; signing in does not upload or merge it.
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
          ) : deletionReceipt ? (
            <DeletionProgressEntry receipt={deletionReceipt} />
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
              <AccountDataEntry key={actor.userId} />
              <DeletionRequestEntry
                onAccepted={(receipt) => {
                  setDeletionReceipt(receipt);
                  setActor(null);
                  setConsents([]);
                  setUsage([]);
                  setEmail("");
                  setCode("");
                  setCodeSent(false);
                  setError("");
                  setMessage("");
                }}
              />
              {actor.role === "admin" && (
                <IdentityAdministration
                  client={identityAdminClient}
                  onChanged={refresh}
                  onUnavailable={() => void refresh().catch(() => setActor(null))}
                />
              )}
            </>
          )}
          <DeletionReceiptEntry />
        </>
      )}
    </>
  );
}
