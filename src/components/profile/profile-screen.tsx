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
import type { SkillClient } from "@/modules/skills/ports";
import type { SkillDictionary } from "@/modules/skills/model";
import type { ProfileClient } from "@/modules/profile/ports";
import { ApplicationError } from "@/modules/platform/errors";
import { msg, useI18n } from "@/lib/i18n";
import { PreferencesForm } from "./preferences-form";
import { EvidenceForm } from "./evidence-form";
import { EvidenceCard } from "./evidence-card";
import { DemoImport } from "./demo-import";

/** Screen orchestration depends only on an injected client port. Child forms own draft state. */
export function ProfileScreen({
  client,
  dictionary,
}: {
  client: ProfileClient;
  dictionary: SkillClient;
}) {
  const { t } = useI18n();
  const [skills, setSkills] = useState<SkillDictionary | null>(null);
  const [profile, setProfile] = useState<CareerProfile | null>(null);
  const [page, setPage] = useState<EvidencePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // Error and notice hold English keys (or server messages) and are translated on render.
  const [error, setError] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<CapabilityEvidence | "new" | null>(null);
  const reportError = useCallback((err: unknown) => {
    setError(
      err instanceof ApplicationError ? err.message : msg("Unable to load the profile. Try again."),
    );
    setUnauthorized(err instanceof ApplicationError && [401, 403].includes(err.status));
  }, []);
  const read = useCallback(async () => {
    const [nextProfile, nextPage, nextSkills] = await Promise.all([
      client.read(),
      client.list({ limit: 20 }),
      dictionary.get(),
    ]);
    if (nextSkills.version !== nextPage.dictionaryVersion)
      throw new ApplicationError(
        "RF_CONFLICT",
        409,
        msg("The dictionary changed. Reload before continuing."),
      );
    setSkills(nextSkills);
    if (nextProfile.revision !== nextPage.revision)
      throw new ApplicationError(
        "RF_CONFLICT",
        409,
        msg("Your profile changed during loading. Reload to continue."),
      );
    setProfile(nextProfile);
    setPage(nextPage);
    setUnauthorized(false);
  }, [client, dictionary]);
  useEffect(() => {
    let active = true;
    void Promise.all([client.read(), client.list({ limit: 20 }), dictionary.get()])
      .then(([p, e, d]) => {
        if (!active) return;
        if (p.revision !== e.revision || d.version !== e.dictionaryVersion)
          throw new ApplicationError(
            "RF_CONFLICT",
            409,
            msg("Your profile changed during loading. Reload to continue."),
          );
        setSkills(d);
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
  }, [client, dictionary, reportError]);
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
      msg("Evidence saved. Recommendations using an older profile revision need refreshing."),
    );
  }
  return (
    <>
      <PageHeading
        eyebrow={t("YOUR PRIVATE CAREER PROFILE")}
        title={t("Claims, context and evidence.")}
        description={t(
          "Keep your preferences and evidence together. A missing skill record means unknown, and course completion does not prove ability.",
        )}
      />
      <div className="notice inline">
        <p>
          {t(
            "This profile is saved to your signed-in account. Other career pages currently use the local demo; its data is uploaded only through the optional reviewed import below.",
          )}
          <Link className="text-link" href="/dictionary/">
            {t("View the shared skill dictionary ↗")}
          </Link>
        </p>
      </div>
      {loading && <p role="status">{t("Loading your private profile…")}</p>}
      {error && (
        <div role="alert" className="notice profile-alert">
          <p>{t(error)}</p>
          {unauthorized ? (
            <Link className="button secondary" href="/account/">
              {t("Sign in to your account")}
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
              {t("Reload profile")}
            </button>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="notice">
          {t(notice)}
        </p>
      )}
      {!unauthorized && profile && page && skills && (
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
                  msg("Preferences saved. Previous recommendations need refreshing."),
                )
              }
            />
            <section className="panel">
              <h2>{t("How evidence is interpreted")}</h2>
              <ul className="detail-list">
                <li>{t("Self-reports are your own claims.")}</li>
                <li>
                  {t("Portfolio links are references; their contents are not fetched or reviewed.")}
                </li>
                <li>{t("Scenario responses retain their question and rubric versions.")}</li>
                <li>
                  {t(
                    "Resume claims require source confirmation before their producing service records them.",
                  )}
                </li>
                <li>
                  {t("Edits create new versions; previous versions remain visible until deletion.")}
                </li>
              </ul>
              <p className="muted">
                {profile.updatedAt
                  ? t("Current profile revision: {revision}. Updated {date}.", {
                      revision: profile.revision,
                      date: profile.updatedAt.slice(0, 10),
                    })
                  : t("Current profile revision: {revision}. Updated after your first save.", {
                      revision: profile.revision,
                    })}
              </p>
            </section>
          </div>
          <section className="section-block">
            <div className="section-heading">
              <div>
                <h2>{t("Capability evidence")}</h2>
                <p className="muted">
                  {t(
                    "Evidence is private. A wrong scenario answer does not erase previous experience.",
                  )}
                </p>
              </div>
              <button className="button primary" disabled={busy} onClick={() => setEditor("new")}>
                {t("Add claim or reference")}
              </button>
            </div>
            {editor && (
              <EvidenceForm
                key={editor === "new" ? "new" : editor.versionId}
                initial={editor === "new" ? undefined : editor}
                skillOptions={skills.skills}
                busy={busy}
                onSave={saveEvidence}
                onCancel={() => setEditor(null)}
              />
            )}
            {!page.data.length && (
              <div className="panel">
                <h3>{t("No evidence recorded yet")}</h3>
                <p>
                  {t(
                    "Add a self-report or portfolio reference. We do not turn course progress into verified skills.",
                  )}
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
                      msg(
                        "Evidence and its history deleted. Dependent recommendations need refreshing.",
                      ),
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
                {t("Load more evidence")}
              </button>
            )}
          </section>
          {profile.revision === 0 && (
            <DemoImport
              busy={busy}
              onImport={(input) =>
                mutate(
                  () => client.importDemo(input),
                  msg(
                    "Reviewed demo preferences and skill claims imported. Other local data remains in this browser.",
                  ),
                )
              }
            />
          )}
        </>
      )}
    </>
  );
}
