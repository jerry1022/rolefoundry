"use client";
import { useState } from "react";
import type { SkillEntry } from "@/modules/skills/model";
import type { SkillAdminClient } from "@/modules/skills/ports";
import { useI18n } from "@/lib/i18n";
export type DictionaryMutation = (work: () => Promise<{ version: number }>) => Promise<void>;
export function SkillEditor({
  entry,
  version,
  busy,
  client,
  onMutation,
  onCancel,
}: {
  entry?: SkillEntry;
  version: number;
  busy: boolean;
  client: SkillAdminClient;
  onMutation: DictionaryMutation;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [id, setId] = useState(entry?.id || ""),
    [nameEn, setEn] = useState(entry?.nameEn || ""),
    [nameZhTw, setZh] = useState(entry?.nameZhTw || ""),
    [description, setDescription] = useState(entry?.description || ""),
    [status, setStatus] = useState<"active" | "deprecated">(
      entry?.status === "deprecated" ? "deprecated" : "active",
    ),
    [reason, setReason] = useState("");
  return (
    <section className="panel">
      <h3>{entry ? t("Edit skill labels") : t("Create a canonical skill")}</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onMutation(() =>
            entry
              ? client.update(id, {
                  expectedVersion: version,
                  nameEn,
                  nameZhTw,
                  description,
                  status,
                  reason,
                })
              : client.create({
                  expectedVersion: version,
                  id,
                  nameEn,
                  nameZhTw,
                  description,
                  reason,
                }),
          );
        }}
      >
        <fieldset disabled={busy} className="profile-form-fields">
          <label>
            {t("Stable skill ID")}
            <input
              aria-label={t("Stable skill ID")}
              className="text-input"
              pattern="[a-z0-9][a-z0-9._-]{0,63}"
              required
              disabled={!!entry}
              value={id}
              onChange={(event) => setId(event.target.value)}
            />
          </label>
          <label>
            {t("English name")}
            <input
              aria-label={t("English name")}
              className="text-input"
              maxLength={160}
              required
              value={nameEn}
              onChange={(event) => setEn(event.target.value)}
            />
          </label>
          <label>
            {t("Traditional Chinese name")}
            <input
              aria-label={t("Traditional Chinese name")}
              className="text-input"
              maxLength={160}
              required
              value={nameZhTw}
              onChange={(event) => setZh(event.target.value)}
            />
          </label>
          <label>
            {t("Description")}
            <textarea
              aria-label={t("Skill description")}
              className="text-input"
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          {entry && (
            <label>
              {t("Status")}
              <select
                aria-label={t("Skill status")}
                className="text-input"
                value={status}
                onChange={(event) => setStatus(event.target.value as typeof status)}
              >
                <option value="active">{t("Active")}</option>
                <option value="deprecated">{t("Deprecated; retain history")}</option>
              </select>
            </label>
          )}
          <label>
            {t("Change reason")}
            <input
              aria-label={t("Skill change reason")}
              className="text-input"
              required
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <div className="button-row">
            <button className="button primary" type="submit">
              {entry ? t("Publish label update") : t("Publish new skill")}
            </button>
            <button className="button secondary" type="button" onClick={onCancel}>
              {t("Cancel")}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
