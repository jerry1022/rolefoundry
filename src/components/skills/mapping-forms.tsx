"use client";
import { useState } from "react";
import type { SkillDictionary } from "@/modules/skills/model";
import type { SkillAdminClient } from "@/modules/skills/ports";
import { tracks } from "@/modules/skills/catalog";
import type { DictionaryMutation } from "./skill-editor";
type Props = {
  dictionary: SkillDictionary;
  client: SkillAdminClient;
  busy: boolean;
  onMutation: DictionaryMutation;
};
export function MappingForms({ dictionary, client, busy, onMutation }: Props) {
  const skills = dictionary.skills.filter((skill) => skill.status === "active");
  const [skillId, setSkill] = useState(skills[0]?.id || ""),
    [alias, setAlias] = useState(""),
    [locale, setLocale] = useState<"en" | "zh-TW">("en"),
    [reason, setReason] = useState("");
  const [parentId, setParent] = useState(skills[0]?.id || ""),
    [childId, setChild] = useState(skills[1]?.id || ""),
    [relation, setRelation] = useState<"prerequisite" | "broader-than">("prerequisite"),
    [relationReason, setRelationReason] = useState("");
  const [track, setTrack] = useState<(typeof tracks)[number]>(tracks[0]),
    [trackSkill, setTrackSkill] = useState(skills[0]?.id || ""),
    [priority, setPriority] = useState(1),
    [trackReason, setTrackReason] = useState("");
  const options = skills.map((skill) => (
    <option key={skill.id} value={skill.id}>
      {skill.nameEn} · {skill.id}
    </option>
  ));
  return (
    <div className="dictionary-admin-grid">
      <section className="panel">
        <h3>Approve an exact alias</h3>
        <p className="muted">
          Language-specific aliases are unique. Cross-language ambiguity stays unresolved until a
          language is chosen.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onMutation(() =>
              client.alias({ expectedVersion: dictionary.version, skillId, alias, locale, reason }),
            );
          }}
        >
          <fieldset disabled={busy} className="profile-form-fields">
            <label>
              Alias skill
              <select
                aria-label="Alias skill"
                className="text-input"
                value={skillId}
                onChange={(event) => setSkill(event.target.value)}
              >
                {options}
              </select>
            </label>
            <label>
              Language
              <select
                aria-label="Alias language"
                className="text-input"
                value={locale}
                onChange={(event) => setLocale(event.target.value as typeof locale)}
              >
                <option value="en">English</option>
                <option value="zh-TW">Traditional Chinese</option>
              </select>
            </label>
            <label>
              Alias
              <input
                aria-label="Alias term"
                className="text-input"
                required
                maxLength={200}
                value={alias}
                onChange={(event) => setAlias(event.target.value)}
              />
            </label>
            <label>
              Reason
              <input
                aria-label="Alias change reason"
                className="text-input"
                required
                maxLength={1000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <button className="button primary">Publish alias</button>
          </fieldset>
        </form>
      </section>
      <section className="panel">
        <h3>Set a reviewed relationship</h3>
        <p className="muted">
          A prerequisite comes before its dependent skill. A broader concept does not prove each
          child skill.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onMutation(() =>
              client.relation({
                expectedVersion: dictionary.version,
                parentId,
                childId,
                relation,
                reason: relationReason,
              }),
            );
          }}
        >
          <fieldset disabled={busy} className="profile-form-fields">
            <label>
              Parent skill
              <select
                aria-label="Parent skill"
                className="text-input"
                value={parentId}
                onChange={(event) => setParent(event.target.value)}
              >
                {options}
              </select>
            </label>
            <label>
              Child skill
              <select
                aria-label="Child skill"
                className="text-input"
                value={childId}
                onChange={(event) => setChild(event.target.value)}
              >
                {options}
              </select>
            </label>
            <label>
              Relationship
              <select
                aria-label="Relationship"
                className="text-input"
                value={relation}
                onChange={(event) => setRelation(event.target.value as typeof relation)}
              >
                <option value="prerequisite">Prerequisite → dependent</option>
                <option value="broader-than">Broader → narrower</option>
              </select>
            </label>
            <label>
              Reason
              <input
                aria-label="Relationship change reason"
                className="text-input"
                required
                maxLength={1000}
                value={relationReason}
                onChange={(event) => setRelationReason(event.target.value)}
              />
            </label>
            <button className="button primary">Publish relationship</button>
          </fieldset>
        </form>
      </section>
      <section className="panel">
        <h3>Map a career track</h3>
        <p className="muted">
          Priority 1 is highest. This editorial mapping does not assign proficiency to a person.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onMutation(() =>
              client.track({
                expectedVersion: dictionary.version,
                track,
                skillId: trackSkill,
                priority,
                reason: trackReason,
              }),
            );
          }}
        >
          <fieldset disabled={busy} className="profile-form-fields">
            <label>
              Track
              <select
                aria-label="Dictionary track"
                className="text-input"
                value={track}
                onChange={(event) => setTrack(event.target.value as typeof track)}
              >
                {tracks.map((track) => (
                  <option key={track}>{track}</option>
                ))}
              </select>
            </label>
            <label>
              Track skill
              <select
                aria-label="Track skill"
                className="text-input"
                value={trackSkill}
                onChange={(event) => setTrackSkill(event.target.value)}
              >
                {options}
              </select>
            </label>
            <label>
              Priority
              <input
                aria-label="Track priority"
                className="text-input"
                type="number"
                min={1}
                max={100}
                required
                value={priority}
                onChange={(event) => setPriority(event.target.valueAsNumber)}
              />
            </label>
            <label>
              Reason
              <input
                aria-label="Track change reason"
                className="text-input"
                required
                maxLength={1000}
                value={trackReason}
                onChange={(event) => setTrackReason(event.target.value)}
              />
            </label>
            <button className="button primary">Publish track mapping</button>
          </fieldset>
        </form>
      </section>
    </div>
  );
}
export function MergeForm({ dictionary, client, busy, onMutation }: Props) {
  const skills = dictionary.skills.filter((skill) => skill.status === "active");
  const [fromId, setFrom] = useState(skills[0]?.id || ""),
    [toId, setTo] = useState(skills[1]?.id || ""),
    [reason, setReason] = useState(""),
    [reviewed, setReviewed] = useState(false);
  const options = skills.map((skill) => (
    <option value={skill.id} key={skill.id}>
      {skill.nameEn} · {skill.id}
    </option>
  ));
  return (
    <section className="panel section-block">
      <h3>Merge equivalent concepts</h3>
      <p className="muted">
        The source ID becomes a permanent redirect. Historical dictionary/evidence versions stay
        unchanged; current joins move to the target. Relationships that would form a cycle are
        rejected.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onMutation(() =>
            client.merge({ expectedVersion: dictionary.version, fromId, toId, reason }),
          );
        }}
      >
        <fieldset className="profile-form-fields" disabled={busy}>
          <label>
            Source concept
            <select
              aria-label="Merge source"
              className="text-input"
              value={fromId}
              onChange={(event) => setFrom(event.target.value)}
            >
              {options}
            </select>
          </label>
          <label>
            Target concept
            <select
              aria-label="Merge target"
              className="text-input"
              value={toId}
              onChange={(event) => setTo(event.target.value)}
            >
              {options}
            </select>
          </label>
          <label>
            Reason
            <input
              aria-label="Merge reason"
              className="text-input"
              maxLength={1000}
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <label className="profile-consent">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(event) => setReviewed(event.target.checked)}
            />
            I reviewed both concepts and their relationships.
          </label>
          <button className="button primary" disabled={!reviewed || fromId === toId}>
            Merge reviewed concepts
          </button>
        </fieldset>
      </form>
    </section>
  );
}
