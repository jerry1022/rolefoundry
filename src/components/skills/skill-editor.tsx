"use client";
import { useState } from "react";
import type { SkillEntry } from "@/modules/skills/model";
import type { SkillAdminClient } from "@/modules/skills/ports";
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
      <h3>{entry ? "Edit skill labels" : "Create a canonical skill"}</h3>
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
            Stable skill ID
            <input
              aria-label="Stable skill ID"
              className="text-input"
              pattern="[a-z0-9][a-z0-9._-]{0,63}"
              required
              disabled={!!entry}
              value={id}
              onChange={(event) => setId(event.target.value)}
            />
          </label>
          <label>
            English name
            <input
              aria-label="English name"
              className="text-input"
              maxLength={160}
              required
              value={nameEn}
              onChange={(event) => setEn(event.target.value)}
            />
          </label>
          <label>
            Traditional Chinese name
            <input
              aria-label="Traditional Chinese name"
              className="text-input"
              maxLength={160}
              required
              value={nameZhTw}
              onChange={(event) => setZh(event.target.value)}
            />
          </label>
          <label>
            Description
            <textarea
              aria-label="Skill description"
              className="text-input"
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          {entry && (
            <label>
              Status
              <select
                aria-label="Skill status"
                className="text-input"
                value={status}
                onChange={(event) => setStatus(event.target.value as typeof status)}
              >
                <option value="active">Active</option>
                <option value="deprecated">Deprecated; retain history</option>
              </select>
            </label>
          )}
          <label>
            Change reason
            <input
              aria-label="Skill change reason"
              className="text-input"
              required
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <div className="button-row">
            <button className="button primary" type="submit">
              {entry ? "Publish label update" : "Publish new skill"}
            </button>
            <button className="button secondary" type="button" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
