"use client";
import { useState } from "react";
import type { SkillDictionary } from "@/modules/skills/model";
import type { SkillAdminClient } from "@/modules/skills/ports";
import { tracks } from "@/modules/skills/catalog";
import type { DictionaryMutation } from "./skill-editor";
import { useI18n } from "@/lib/i18n";
type Props = {
  dictionary: SkillDictionary;
  client: SkillAdminClient;
  busy: boolean;
  onMutation: DictionaryMutation;
};
export function MappingForms({ dictionary, client, busy, onMutation }: Props) {
  const { t } = useI18n();
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
        <h3>{t("Approve an exact alias")}</h3>
        <p className="muted">
          {t(
            "Language-specific aliases are unique. Cross-language ambiguity stays unresolved until a language is chosen.",
          )}
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
              {t("Alias skill")}
              <select
                aria-label={t("Alias skill")}
                className="text-input"
                value={skillId}
                onChange={(event) => setSkill(event.target.value)}
              >
                {options}
              </select>
            </label>
            <label>
              {t("Language")}
              <select
                aria-label={t("Alias language")}
                className="text-input"
                value={locale}
                onChange={(event) => setLocale(event.target.value as typeof locale)}
              >
                <option value="en">{t("English")}</option>
                <option value="zh-TW">{t("Traditional Chinese")}</option>
              </select>
            </label>
            <label>
              {t("Alias")}
              <input
                aria-label={t("Alias term")}
                className="text-input"
                required
                maxLength={200}
                value={alias}
                onChange={(event) => setAlias(event.target.value)}
              />
            </label>
            <label>
              {t("Reason")}
              <input
                aria-label={t("Alias change reason")}
                className="text-input"
                required
                maxLength={1000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <button className="button primary">{t("Publish alias")}</button>
          </fieldset>
        </form>
      </section>
      <section className="panel">
        <h3>{t("Set a reviewed relationship")}</h3>
        <p className="muted">
          {t(
            "A prerequisite comes before its dependent skill. A broader concept does not prove each child skill.",
          )}
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
              {t("Parent skill")}
              <select
                aria-label={t("Parent skill")}
                className="text-input"
                value={parentId}
                onChange={(event) => setParent(event.target.value)}
              >
                {options}
              </select>
            </label>
            <label>
              {t("Child skill")}
              <select
                aria-label={t("Child skill")}
                className="text-input"
                value={childId}
                onChange={(event) => setChild(event.target.value)}
              >
                {options}
              </select>
            </label>
            <label>
              {t("Relationship")}
              <select
                aria-label={t("Relationship")}
                className="text-input"
                value={relation}
                onChange={(event) => setRelation(event.target.value as typeof relation)}
              >
                <option value="prerequisite">{t("Prerequisite → dependent")}</option>
                <option value="broader-than">{t("Broader → narrower")}</option>
              </select>
            </label>
            <label>
              {t("Reason")}
              <input
                aria-label={t("Relationship change reason")}
                className="text-input"
                required
                maxLength={1000}
                value={relationReason}
                onChange={(event) => setRelationReason(event.target.value)}
              />
            </label>
            <button className="button primary">{t("Publish relationship")}</button>
          </fieldset>
        </form>
      </section>
      <section className="panel">
        <h3>{t("Map a career track")}</h3>
        <p className="muted">
          {t(
            "Priority 1 is highest. This editorial mapping does not assign proficiency to a person.",
          )}
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
              {t("Track")}
              <select
                aria-label={t("Dictionary track")}
                className="text-input"
                value={track}
                onChange={(event) => setTrack(event.target.value as typeof track)}
              >
                {tracks.map((track) => (
                  <option key={track} value={track}>
                    {t(track)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("Track skill")}
              <select
                aria-label={t("Track skill")}
                className="text-input"
                value={trackSkill}
                onChange={(event) => setTrackSkill(event.target.value)}
              >
                {options}
              </select>
            </label>
            <label>
              {t("Priority")}
              <input
                aria-label={t("Track priority")}
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
              {t("Reason")}
              <input
                aria-label={t("Track change reason")}
                className="text-input"
                required
                maxLength={1000}
                value={trackReason}
                onChange={(event) => setTrackReason(event.target.value)}
              />
            </label>
            <button className="button primary">{t("Publish track mapping")}</button>
          </fieldset>
        </form>
      </section>
    </div>
  );
}
export function MergeForm({ dictionary, client, busy, onMutation }: Props) {
  const { t } = useI18n();
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
      <h3>{t("Merge equivalent concepts")}</h3>
      <p className="muted">
        {t(
          "The source ID becomes a permanent redirect. Historical dictionary/evidence versions stay unchanged; current joins move to the target. Relationships that would form a cycle are rejected.",
        )}
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
            {t("Source concept")}
            <select
              aria-label={t("Merge source")}
              className="text-input"
              value={fromId}
              onChange={(event) => setFrom(event.target.value)}
            >
              {options}
            </select>
          </label>
          <label>
            {t("Target concept")}
            <select
              aria-label={t("Merge target")}
              className="text-input"
              value={toId}
              onChange={(event) => setTo(event.target.value)}
            >
              {options}
            </select>
          </label>
          <label>
            {t("Reason")}
            <input
              aria-label={t("Merge reason")}
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
            {t("I reviewed both concepts and their relationships.")}
          </label>
          <button className="button primary" disabled={!reviewed || fromId === toId}>
            {t("Merge reviewed concepts")}
          </button>
        </fieldset>
      </form>
    </section>
  );
}
