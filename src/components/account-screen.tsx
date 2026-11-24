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
import { msg, useI18n } from "@/lib/i18n";
import { CheckCircle2, LogOut, Mail, ShieldCheck } from "lucide-react";
import {
  actorSchema,
  consentSchema,
  policySchema,
  usageSchema,
  type Actor,
  type AnalysisFeature,
} from "@/modules/identity/core";

/** Typed per purpose: a new consent purpose fails to compile until it has labels. */
const purposeTitles: Record<AnalysisFeature, string> = {
  assessment: msg("Assessment analysis"),
  resume: msg("Resume analysis"),
  matching: msg("Semantic role ranking"),
};
const allowanceLabels: Record<AnalysisFeature, string> = {
  assessment: msg("assessment analysis"),
  resume: msg("resume analysis"),
  matching: msg("semantic ranking"),
};

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
      // An empty message falls back to translated client text where the error is shown.
      result.error?.message || "",
    );
  return result.data;
}
type Policy = z.infer<typeof policySchema>;
type Consent = z.infer<typeof consentSchema>;
type Usage = z.infer<typeof usageSchema>;

export function AccountScreen() {
  const { t } = useI18n();
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
          setError(
            failure instanceof Error && failure.message
              ? failure.message
              : t("Unable to load your account."),
          ),
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
      setError(
        failure instanceof Error && failure.message
          ? failure.message
          : t("The request could not be completed."),
      );
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
          <p className="eyebrow">{t("YOUR ACCOUNT, YOUR CHOICE")}</p>
          <h1>{t("Account & privacy.")}</h1>
          <p className="page-description">
            {t(
              "Invitation-only sign-in, explicit analysis consent and a clear view of your weekly limits.",
            )}
          </p>
        </div>
      </div>
      {!enabled ? (
        <section className="panel account-demo">
          <ShieldCheck size={30} />
          <h2>{t("You're exploring the local demo.")}</h2>
          <p>
            {t(
              "This static demo does not connect to an identity service. Your workspace remains in this browser.",
            )}
          </p>
          <p>
            {t(
              "Email sign-in and account controls are available in configured server deployments. See the repository's identity setup guide to run them locally.",
            )}
          </p>
          <a
            className="text-link"
            href="https://github.com/jerry1022/rolefoundry/blob/main/docs/IDENTITY_SETUP.md"
            target="_blank"
            rel="noreferrer"
          >
            {t("Identity setup guide")}
          </a>
        </section>
      ) : (
        <>
          <div className="notice inline">
            <ShieldCheck size={18} />
            <span>
              {t(
                "Sign-in protects your private career data. Browser-local demo data is imported only through an explicit reviewed action; signing in does not upload or merge it.",
              )}
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
              {t("Loading your account…")}
            </section>
          ) : deletionReceipt ? (
            <DeletionProgressEntry receipt={deletionReceipt} />
          ) : !actor ? (
            <section className="panel account-signin">
              <span className="large-icon">
                <Mail size={24} />
              </span>
              <h2>{t("Sign in with an invitation.")}</h2>
              <p className="muted">
                {t("Use your invited email address. Enter the code from your email to continue.")}
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
                  {t("Email address")}
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
                  {codeSent ? t("Request another code") : t("Send sign-in code")}
                </button>
              </form>
              {codeSent && (
                <form
                  onSubmit={(event) =>
                    submit(event, async () => {
                      await request("verify", "POST", { email, code });
                      setCode("");
                      await refresh();
                      setMessage(t("You are signed in."));
                    })
                  }
                >
                  <label className="field-label">
                    {t("Sign-in code")}
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
                    {t("Verify and sign in")}
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
                  <h2>
                    {t("Signed in as a {role}", {
                      role: actor.role === "admin" ? t("admin") : t("member"),
                    })}
                  </h2>
                  <p className="muted">
                    {t("Account {id} · verified server session", { id: actor.userId.slice(0, 8) })}
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
                      setMessage(t("You have signed out of this device."));
                    })
                  }
                >
                  <LogOut size={15} />
                  {t("Sign out")}
                </button>
              </section>
              <section className="panel section-block">
                <h2>{t("Analysis permissions")}</h2>
                <p className="muted account-intro">
                  {t(
                    "Choose separately for each purpose. Revoking permission cancels queued work and prevents an in-progress result from being published. This page does not run an AI analysis.",
                  )}
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
                          {granted ? t("Permission granted") : t("No current permission")}
                        </span>
                        <h3>{t(purposeTitles[policy.purpose])}</h3>
                        <p>{policy.description}</p>
                        <small>{t("Policy version {version}", { version: policy.version })}</small>
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
                                  ? t(
                                      "Permission revoked. A provider call already in progress cannot be recalled, but its result cannot be published after revocation.",
                                    )
                                  : t("Your permission has been recorded for this policy version."),
                              );
                            })
                          }
                        >
                          {granted ? t("Revoke permission") : t("I agree to this policy")}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
              <section className="panel section-block">
                <h2>{t("Weekly analysis allowance")}</h2>
                <div className="account-usage">
                  {usage.map((item) => (
                    <article className="stat-card" key={item.feature}>
                      <span className="mini-label">{t(allowanceLabels[item.feature])}</span>
                      <strong className="stat-number">
                        {Math.max(0, item.limit - item.reserved - item.consumed)}
                        <small> {t("/ {limit} remaining", { limit: item.limit })}</small>
                      </strong>
                      <p>
                        {t("{reserved} reserved · {consumed} consumed", {
                          reserved: item.reserved,
                          consumed: item.consumed,
                        })}
                      </p>
                      <p>{t("Resets Monday 00:00 UTC")}</p>
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
