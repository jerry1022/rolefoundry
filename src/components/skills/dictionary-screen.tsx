"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeading } from "../ui/page-heading";
import type { SkillClient, SkillAdminClient } from "@/modules/skills/ports";
import type { SkillDictionary, SkillEntry, SkillResolution } from "@/modules/skills/model";
import { normalizeSkillTerm, skillLabel } from "@/modules/skills/model";
import { ApplicationError } from "@/modules/platform/errors";
import { msg, useI18n } from "@/lib/i18n";
import { SkillEditor } from "./skill-editor";
import { MappingForms, MergeForm } from "./mapping-forms";
export function DictionaryScreen({
  client,
  adminClient,
  isAdmin,
  embedded = false,
}: {
  client: SkillClient;
  adminClient: SkillAdminClient;
  isAdmin: () => Promise<boolean>;
  embedded?: boolean;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState("");
  const [dictionary, setDictionary] = useState<SkillDictionary | null>(null),
    [admin, setAdmin] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [term, setTerm] = useState(""),
    [locale, setLocale] = useState(""),
    [resolved, setResolved] = useState<SkillResolution | null>(null),
    [editor, setEditor] = useState<SkillEntry | "new" | null>(null),
    [version, setVersion] = useState(""),
    [historical, setHistorical] = useState(false),
    [removalReason, setRemovalReason] = useState("");
  function failed(error: unknown) {
    if (error instanceof ApplicationError && [401, 403].includes(error.status)) {
      setAdmin(false);
      setEditor(null);
      setRemovalReason("");
      setMessage("");
    }
    setError(
      error instanceof ApplicationError
        ? error.message
        : msg("Unable to load the dictionary. Try again."),
    );
  }
  useEffect(() => {
    let active = true;
    void client
      .get()
      .then((value) => {
        if (active) setDictionary(value);
      })
      .catch((error) => {
        if (active) failed(error);
      });
    void isAdmin()
      .then((value) => {
        if (active) setAdmin(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [client, isAdmin]);
  async function mutate(work: () => Promise<{ version: number }>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      setDictionary(await client.get());
      setEditor(null);
      setResolved(null);
      setMessage(
        msg("Dictionary version published. Results based on an older dictionary need refreshing."),
      );
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  }
  const visibleSkills =
    dictionary?.skills.filter((skill) =>
      [skill.id, skill.nameEn, skill.nameZhTw].some((value) =>
        normalizeSkillTerm(value).includes(normalizeSkillTerm(filter)),
      ),
    ) || [];
  const labels = Object.fromEntries(
    dictionary?.skills.map((skill) => [skill.id, skill.nameEn]) || [],
  );
  return (
    <>
      {!embedded && (
        <PageHeading
          eyebrow={t("STABLE IDS · REVIEWED MEANING")}
          title={t("The shared language of skills.")}
          description={t(
            "Explore canonical concepts, exact aliases and their versions. Related concepts and completed courses do not automatically prove ability.",
          )}
          action={
            <Link className="button secondary" href="/skills/">
              {t("My private skill profile")}
            </Link>
          }
        />
      )}
      {error && (
        <div className="notice" role="alert">
          <p>{t(error)}</p>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => {
              setError("");
              setHistorical(false);
              void client.get().then(setDictionary).catch(failed);
            }}
          >
            {t("Reload current dictionary")}
          </button>
        </div>
      )}
      {message && (
        <p className="notice" role="status">
          {t(message)}
        </p>
      )}
      {!dictionary && !error && <p role="status">{t("Loading the skill dictionary…")}</p>}
      {dictionary && (
        <>
          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>{t("Dictionary version {version}", { version: dictionary.version })}</h2>
                <p className="muted">
                  {historical
                    ? t("Historical snapshot; editing is disabled.")
                    : t("Published current snapshot.")}{" "}
                  {t("Updated {date}.", { date: dictionary.createdAt.slice(0, 10) })}
                </p>
              </div>
              {admin && !historical && (
                <button className="button primary" disabled={busy} onClick={() => setEditor("new")}>
                  {t("Add canonical skill")}
                </button>
              )}
            </div>
            <form
              className="dictionary-inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                setBusy(true);
                setError("");
                void client
                  .get(Number(version))
                  .then((value) => {
                    setDictionary(value);
                    setHistorical(true);
                    setEditor(null);
                    setResolved(null);
                  })
                  .catch(failed)
                  .finally(() => setBusy(false));
              }}
            >
              <label>
                {t("Historical version")}
                <input
                  aria-label={t("Historical dictionary version")}
                  className="text-input"
                  type="number"
                  min={1}
                  required
                  value={version}
                  onChange={(event) => setVersion(event.target.value)}
                />
              </label>
              <button className="button secondary" disabled={busy}>
                {t("View snapshot")}
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  setHistorical(false);
                  setError("");
                  void client.get().then(setDictionary).catch(failed);
                }}
              >
                {t("Current version")}
              </button>
            </form>
          </section>
          <section className="panel section-block">
            <h2>{t("Resolve an exact term")}</h2>
            <p className="muted">
              {t(
                "Unresolved and ambiguous terms need review; this lookup does not guess with semantic similarity.",
              )}
            </p>
            <form
              className="dictionary-inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                setBusy(true);
                setError("");
                void client
                  .resolve({
                    term,
                    ...(locale ? { locale: locale as "en" | "zh-TW" } : {}),
                    version: dictionary.version,
                  })
                  .then(setResolved)
                  .catch(failed)
                  .finally(() => setBusy(false));
              }}
            >
              <label>
                {t("Term")}
                <input
                  aria-label={t("Skill term")}
                  className="text-input"
                  required
                  maxLength={200}
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                />
              </label>
              <label>
                {t("Language")}
                <select
                  aria-label={t("Resolution language")}
                  className="text-input"
                  value={locale}
                  onChange={(event) => setLocale(event.target.value)}
                >
                  <option value="">{t("Any language; show ambiguity")}</option>
                  <option value="en">{t("English")}</option>
                  <option value="zh-TW">{t("Traditional Chinese")}</option>
                </select>
              </label>
              <button className="button primary" disabled={busy}>
                {t("Resolve term")}
              </button>
            </form>
            {resolved && (
              <div className="notice section-block" role="status">
                <strong>
                  {resolved.status === "resolved"
                    ? t("Resolved: {skill}", { skill: skillLabel(resolved.skillId!, labels) })
                    : resolved.status === "ambiguous"
                      ? t("Ambiguous term; choose a language or review the candidates.")
                      : t("No approved exact mapping. Keep this term unmapped for review.")}
                </strong>
                <p>
                  {t("Normalized term: {term} · Dictionary {version}", {
                    term: resolved.normalizedTerm,
                    version: resolved.version,
                  })}
                </p>
                {resolved.candidates.length > 0 && (
                  <p>
                    {resolved.candidates
                      .map((id) => `${skillLabel(id, labels)} (${id})`)
                      .join(", ")}
                  </p>
                )}
                {resolved.redirectedFrom && (
                  <p>
                    {t("Retained ID {from} redirects to {to}.", {
                      from: resolved.redirectedFrom,
                      to: resolved.skillId ?? "",
                    })}
                  </p>
                )}
              </div>
            )}
          </section>
          <label>
            {t("Filter skill concepts")}
            <input
              aria-label={t("Filter skill concepts")}
              className="text-input"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </label>
          <div className="dictionary-skill-grid section-block">
            {visibleSkills.map((skill) => (
              <article className="panel" key={skill.id}>
                <span className="pill">{skill.status}</span>
                <h3>{skill.nameEn}</h3>
                <p lang="zh-Hant">{skill.nameZhTw}</p>
                <small>{skill.id}</small>
                <p>{skill.description}</p>
                {skill.redirectTo && (
                  <p>
                    {t("Redirects to {skill} ({id}).", {
                      skill: skillLabel(skill.redirectTo, labels),
                      id: skill.redirectTo,
                    })}
                  </p>
                )}
                <div className="tags">
                  {dictionary.aliases
                    .filter((alias) => alias.skillId === skill.id)
                    .map((alias) => (
                      <span className="skill-tag" key={`${alias.locale}-${alias.normalizedAlias}`}>
                        {alias.alias} · {alias.locale}
                      </span>
                    ))}
                </div>
                {admin && !historical && skill.status !== "merged" && (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setEditor(skill)}
                    aria-label={t("Edit {skill}", { skill: skill.nameEn })}
                  >
                    {t("Edit labels")}
                  </button>
                )}
              </article>
            ))}
          </div>
          <section className="panel section-block">
            <h2>{t("Reviewed relationships and track mappings")}</h2>
            {!dictionary.relations.length && (
              <p className="muted">{t("No reviewed relationships published yet.")}</p>
            )}
            {dictionary.relations.map((relation) => (
              <p key={`${relation.relation}-${relation.parentId}-${relation.childId}`}>
                {skillLabel(relation.parentId, labels)} → {skillLabel(relation.childId, labels)} ·{" "}
                {relation.relation}
              </p>
            ))}
            {dictionary.trackSkills.map((mapping) => (
              <p key={`${mapping.track}-${mapping.skillId}`}>
                {t(mapping.track)} · {skillLabel(mapping.skillId, labels)} ·{" "}
                {t("Priority {priority}", { priority: mapping.priority })}
              </p>
            ))}
          </section>
          {admin && !historical && (
            <section className="section-block">
              <h2>{t("Dictionary administration")}</h2>
              <p className="muted">
                {t(
                  "Publishing creates an immutable snapshot and an audit event. Existing source evidence remains available under its original dictionary version.",
                )}
              </p>
              {editor && (
                <SkillEditor
                  key={editor === "new" ? "new" : `${editor.id}-${dictionary.version}`}
                  entry={editor === "new" ? undefined : editor}
                  version={dictionary.version}
                  busy={busy}
                  client={adminClient}
                  onMutation={mutate}
                  onCancel={() => setEditor(null)}
                />
              )}
              <MappingForms
                key={`mapping-${dictionary.version}`}
                dictionary={dictionary}
                client={adminClient}
                busy={busy}
                onMutation={mutate}
              />
              <MergeForm
                key={`merge-${dictionary.version}`}
                dictionary={dictionary}
                client={adminClient}
                busy={busy}
                onMutation={mutate}
              />
              <section className="panel section-block">
                <h3>{t("Remove an incorrect mapping")}</h3>
                <label>
                  {t("Removal reason")}
                  <input
                    aria-label={t("Mapping removal reason")}
                    className="text-input"
                    maxLength={1000}
                    value={removalReason}
                    onChange={(event) => setRemovalReason(event.target.value)}
                  />
                </label>
                <div className="dictionary-removals">
                  {dictionary.aliases.map((alias) => (
                    <button
                      className="button secondary"
                      disabled={busy || !removalReason.trim()}
                      key={`alias-${alias.locale}-${alias.normalizedAlias}`}
                      onClick={() =>
                        void mutate(() =>
                          adminClient.removeAlias({
                            expectedVersion: dictionary.version,
                            locale: alias.locale,
                            alias: alias.alias,
                            reason: removalReason,
                          }),
                        )
                      }
                    >
                      {t("Remove alias: {alias} ({locale})", {
                        alias: alias.alias,
                        locale: alias.locale,
                      })}
                    </button>
                  ))}
                  {dictionary.relations.map((relation) => (
                    <button
                      className="button secondary"
                      disabled={busy || !removalReason.trim()}
                      key={`relation-${relation.parentId}-${relation.childId}-${relation.relation}`}
                      onClick={() =>
                        void mutate(() =>
                          adminClient.removeRelation({
                            ...relation,
                            expectedVersion: dictionary.version,
                            reason: removalReason,
                          }),
                        )
                      }
                    >
                      {t("Remove {parent} → {child} ({relation})", {
                        parent: relation.parentId,
                        child: relation.childId,
                        relation: relation.relation,
                      })}
                    </button>
                  ))}
                  {dictionary.trackSkills.map((mapping) => (
                    <button
                      className="button secondary"
                      disabled={busy || !removalReason.trim()}
                      key={`track-${mapping.track}-${mapping.skillId}`}
                      onClick={() =>
                        void mutate(() =>
                          adminClient.removeTrack({
                            track: mapping.track,
                            skillId: mapping.skillId,
                            expectedVersion: dictionary.version,
                            reason: removalReason,
                          }),
                        )
                      }
                    >
                      {t("Remove {skill} from {track}", {
                        skill: mapping.skillId,
                        track: t(mapping.track),
                      })}
                    </button>
                  ))}
                </div>
              </section>
            </section>
          )}
        </>
      )}
    </>
  );
}
