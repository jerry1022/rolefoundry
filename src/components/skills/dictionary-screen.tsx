"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeading } from "../ui/page-heading";
import type { SkillClient, SkillAdminClient } from "@/modules/skills/ports";
import type { SkillDictionary, SkillEntry, SkillResolution } from "@/modules/skills/model";
import { normalizeSkillTerm, skillLabel } from "@/modules/skills/model";
import { ApplicationError } from "@/modules/platform/errors";
import { SkillEditor } from "./skill-editor";
import { MappingForms, MergeForm } from "./mapping-forms";
export function DictionaryScreen({
  client,
  adminClient,
  isAdmin,
}: {
  client: SkillClient;
  adminClient: SkillAdminClient;
  isAdmin: () => Promise<boolean>;
}) {
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
    setError(
      error instanceof ApplicationError
        ? error.message
        : "Unable to load the dictionary. Try again.",
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
        "Dictionary version published. Results based on an older dictionary need refreshing.",
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
      <PageHeading
        eyebrow="STABLE IDS · REVIEWED MEANING"
        title="The shared language of skills."
        description="Explore canonical concepts, exact aliases and their versions. Related concepts and completed courses do not automatically prove ability."
        action={
          <Link className="button secondary" href="/skills/">
            My private skill profile
          </Link>
        }
      />
      {error && (
        <div className="notice" role="alert">
          <p>{error}</p>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => {
              setError("");
              setHistorical(false);
              void client.get().then(setDictionary).catch(failed);
            }}
          >
            Reload current dictionary
          </button>
        </div>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {!dictionary && !error && <p role="status">Loading the skill dictionary…</p>}
      {dictionary && (
        <>
          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>Dictionary version {dictionary.version}</h2>
                <p className="muted">
                  {historical
                    ? "Historical snapshot; editing is disabled."
                    : "Published current snapshot."}{" "}
                  Updated {dictionary.createdAt.slice(0, 10)}.
                </p>
              </div>
              {admin && !historical && (
                <button className="button primary" disabled={busy} onClick={() => setEditor("new")}>
                  Add canonical skill
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
                Historical version
                <input
                  aria-label="Historical dictionary version"
                  className="text-input"
                  type="number"
                  min={1}
                  required
                  value={version}
                  onChange={(event) => setVersion(event.target.value)}
                />
              </label>
              <button className="button secondary" disabled={busy}>
                View snapshot
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
                Current version
              </button>
            </form>
          </section>
          <section className="panel section-block">
            <h2>Resolve an exact term</h2>
            <p className="muted">
              Unresolved and ambiguous terms need review; this lookup does not guess with semantic
              similarity.
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
                Term
                <input
                  aria-label="Skill term"
                  className="text-input"
                  required
                  maxLength={200}
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                />
              </label>
              <label>
                Language
                <select
                  aria-label="Resolution language"
                  className="text-input"
                  value={locale}
                  onChange={(event) => setLocale(event.target.value)}
                >
                  <option value="">Any language; show ambiguity</option>
                  <option value="en">English</option>
                  <option value="zh-TW">Traditional Chinese</option>
                </select>
              </label>
              <button className="button primary" disabled={busy}>
                Resolve term
              </button>
            </form>
            {resolved && (
              <div className="notice section-block" role="status">
                <strong>
                  {resolved.status === "resolved"
                    ? `Resolved: ${skillLabel(resolved.skillId!, labels)}`
                    : resolved.status === "ambiguous"
                      ? "Ambiguous term; choose a language or review the candidates."
                      : "No approved exact mapping. Keep this term unmapped for review."}
                </strong>
                <p>
                  Normalized term: {resolved.normalizedTerm} · Dictionary {resolved.version}
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
                    Retained ID {resolved.redirectedFrom} redirects to {resolved.skillId}.
                  </p>
                )}
              </div>
            )}
          </section>
          <label>
            Filter skill concepts
            <input
              aria-label="Filter skill concepts"
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
                    Redirects to {skillLabel(skill.redirectTo, labels)} ({skill.redirectTo}).
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
                    aria-label={`Edit ${skill.nameEn}`}
                  >
                    Edit labels
                  </button>
                )}
              </article>
            ))}
          </div>
          <section className="panel section-block">
            <h2>Reviewed relationships and track mappings</h2>
            {!dictionary.relations.length && (
              <p className="muted">No reviewed relationships published yet.</p>
            )}
            {dictionary.relations.map((relation) => (
              <p key={`${relation.relation}-${relation.parentId}-${relation.childId}`}>
                {skillLabel(relation.parentId, labels)} → {skillLabel(relation.childId, labels)} ·{" "}
                {relation.relation}
              </p>
            ))}
            {dictionary.trackSkills.map((mapping) => (
              <p key={`${mapping.track}-${mapping.skillId}`}>
                {mapping.track} · {skillLabel(mapping.skillId, labels)} · Priority{" "}
                {mapping.priority}
              </p>
            ))}
          </section>
          {admin && !historical && (
            <section className="section-block">
              <h2>Dictionary administration</h2>
              <p className="muted">
                Publishing creates an immutable snapshot and an audit event. Existing source
                evidence remains available under its original dictionary version.
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
                <h3>Remove an incorrect mapping</h3>
                <label>
                  Removal reason
                  <input
                    aria-label="Mapping removal reason"
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
                      Remove alias: {alias.alias} ({alias.locale})
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
                      Remove {relation.parentId} → {relation.childId} ({relation.relation})
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
                      Remove {mapping.skillId} from {mapping.track}
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
