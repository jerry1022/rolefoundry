"use client";
import Link from "next/link";
import { PageHeading } from "../ui/page-heading";
import { useCallback, useEffect, useState } from "react";
import type {
  CareerProfile,
  CapabilityEvidence,
  EvidencePage,
  PublicEvidenceInput,
} from "@/modules/profile/model";
import type { ProfileClient } from "@/modules/profile/ports";
import { ApplicationError } from "@/modules/platform/errors";
import { PreferencesForm } from "./preferences-form";
import { EvidenceForm } from "./evidence-form";
import { EvidenceCard } from "./evidence-card";
import { DemoImport } from "./demo-import";

/** Screen orchestration depends only on an injected client port. Child forms own draft state. */
export function ProfileScreen({ client }: { client: ProfileClient }) {
  const [profile, setProfile] = useState<CareerProfile | null>(null);
  const [page, setPage] = useState<EvidencePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<CapabilityEvidence | "new" | null>(null);
  const reportError = useCallback((err: unknown) => {
    setError(
      err instanceof ApplicationError ? err.message : "Unable to load the profile. Try again.",
    );
    setUnauthorized(err instanceof ApplicationError && [401, 403].includes(err.status));
  }, []);
  const read = useCallback(async () => {
    const [nextProfile, nextPage] = await Promise.all([client.read(), client.list({ limit: 20 })]);
    if (nextProfile.revision !== nextPage.revision)
      throw new ApplicationError(
        "RF_CONFLICT",
        409,
        "Your profile changed during loading. Reload to continue.",
      );
    setProfile(nextProfile);
    setPage(nextPage);
    setUnauthorized(false);
  }, [client]);
  useEffect(() => {
    let active = true;
    void Promise.all([client.read(), client.list({ limit: 20 })])
      .then(([p, e]) => {
        if (!active) return;
        if (p.revision !== e.revision)
          throw new ApplicationError(
            "RF_CONFLICT",
            409,
            "Your profile changed during loading. Reload to continue.",
          );
        setProfile(p);
        setPage(e);
      })
      .catch((err) => {
        if (active) reportError(err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, reportError]);
  async function mutate(work: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setEditor(null);
      await read();
      setNotice(message);
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  }
  async function saveEvidence(input: PublicEvidenceInput) {
    if (!profile) return;
    await mutate(
      () =>
        editor && editor !== "new"
          ? client.edit(editor.id, {
              expectedRevision: profile.revision,
              expectedVersion: editor.version,
              evidence: input,
            })
          : client.create({ expectedRevision: profile.revision, evidence: input }),
      "Evidence saved. Recommendations using an older profile revision need refreshing.",
    );
  }
  return (
    <>
      <PageHeading
        eyebrow="YOUR PRIVATE CAREER PROFILE"
        title="Claims, context and evidence."
        description="Keep your preferences and evidence together. A missing skill record means unknown, and course completion does not prove ability."
      />
      <div className="notice inline">
        <p>
          This profile is saved to your signed-in account. Other career pages currently use the
          local demo; its data is uploaded only through the optional reviewed import below.
        </p>
      </div>
      {loading && <p role="status">Loading your private profile…</p>}
      {error && (
        <div role="alert" className="notice profile-alert">
          <p>{error}</p>
          {unauthorized ? (
            <Link className="button secondary" href="/account/">
              Sign in to your account
            </Link>
          ) : (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError("");
                void read()
                  .then(() => setEditor(null))
                  .catch(reportError)
                  .finally(() => setBusy(false));
              }}
            >
              Reload profile
            </button>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {!unauthorized && profile && page && (
        <>
          <div className="profile-account-grid section-block">
            <PreferencesForm
              key={JSON.stringify([
                profile.name,
                profile.track,
                profile.workplaces,
                profile.weeklyHours,
              ])}
              profile={profile}
              busy={busy}
              onSave={(value) =>
                mutate(
                  () => client.update({ ...value, expectedRevision: profile.revision }),
                  "Preferences saved. Previous recommendations need refreshing.",
                )
              }
            />
            <section className="panel">
              <h2>How evidence is interpreted</h2>
              <ul className="detail-list">
                <li>Self-reports are your own claims.</li>
                <li>Portfolio links are references; their contents are not fetched or reviewed.</li>
                <li>Scenario responses retain their question and rubric versions.</li>
                <li>
                  Resume claims require source confirmation before their producing service records
                  them.
                </li>
                <li>Edits create new versions; previous versions remain visible until deletion.</li>
              </ul>
              <p className="muted">
                Current profile revision: {profile.revision}. Updated{" "}
                {profile.updatedAt?.slice(0, 10) || "after your first save"}.
              </p>
            </section>
          </div>
          <section className="section-block">
            <div className="section-heading">
              <div>
                <h2>Capability evidence</h2>
                <p className="muted">
                  Evidence is private. A wrong scenario answer does not erase previous experience.
                </p>
              </div>
              <button className="button primary" disabled={busy} onClick={() => setEditor("new")}>
                Add claim or reference
              </button>
            </div>
            {editor && (
              <EvidenceForm
                key={editor === "new" ? "new" : editor.versionId}
                initial={editor === "new" ? undefined : editor}
                busy={busy}
                onSave={saveEvidence}
                onCancel={() => setEditor(null)}
              />
            )}
            {!page.data.length && (
              <div className="panel">
                <h3>No evidence recorded yet</h3>
                <p>
                  Add a self-report or portfolio reference. We do not turn course progress into
                  verified skills.
                </p>
              </div>
            )}
            <div className="profile-evidence-list">
              {page.data.map((evidence) => (
                <EvidenceCard
                  key={evidence.versionId}
                  evidence={evidence}
                  busy={busy}
                  onEdit={() => setEditor(evidence)}
                  onDelete={() =>
                    mutate(
                      () =>
                        client.remove(evidence.id, {
                          expectedRevision: profile.revision,
                          expectedVersion: evidence.version,
                        }),
                      "Evidence and its history deleted. Dependent recommendations need refreshing.",
                    )
                  }
                  onHistory={() => client.history(evidence.id)}
                />
              ))}
            </div>
            {page.nextCursor && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void client
                    .list({ limit: 20, cursor: page.nextCursor! })
                    .then((next) => {
                      setPage({ ...next, data: [...page.data, ...next.data] });
                    })
                    .catch(reportError)
                    .finally(() => setBusy(false));
                }}
              >
                Load more evidence
              </button>
            )}
          </section>
          {profile.revision === 0 && (
            <DemoImport
              busy={busy}
              onImport={(input) =>
                mutate(
                  () => client.importDemo(input),
                  "Reviewed demo preferences and skill claims imported. Other local data remains in this browser.",
                )
              }
            />
          )}
        </>
      )}
    </>
  );
}
