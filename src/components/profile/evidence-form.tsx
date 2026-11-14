"use client";
import { useId, useState } from "react";
import type { SkillEntry } from "@/modules/skills/model";
import {
  publicEvidenceSchema,
  type CapabilityEvidence,
  type PublicEvidenceInput,
} from "@/modules/profile/model";

export function EvidenceForm({
  initial,
  busy,
  onSave,
  onCancel,
  skillOptions,
}: {
  initial?: CapabilityEvidence;
  skillOptions: SkillEntry[];
  busy: boolean;
  onSave: (value: PublicEvidenceInput) => Promise<void>;
  onCancel: () => void;
}) {
  const formId = useId();
  const [source, setSource] = useState<"self-report" | "portfolio-reference">(
    (initial?.source as "self-report" | "portfolio-reference") || "self-report",
  );
  const [label, setLabel] = useState(initial?.label || "");
  const [context, setContext] = useState(initial?.context || "");
  const [date, setDate] = useState((initial?.observedAt || new Date().toISOString()).slice(0, 10));
  const [skills, setSkills] = useState<string[]>(initial?.canonicalSkills || initial?.skills || []);
  const [level, setLevel] = useState(initial?.claimedLevel ?? 1);
  const [url, setUrl] = useState(initial?.url || "");
  const [error, setError] = useState("");
  return (
    <section className="panel">
      <h2>{initial ? "Revise evidence" : "Add a claim or reference"}</h2>
      <p className="muted">
        A self-report or URL does not verify mastery. Scored evidence is created by its source
        service.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (
            skills.some((id) => skillOptions.find((skill) => skill.id === id)?.status !== "active")
          ) {
            setError("Deselect deprecated skills and choose a current skill before saving.");
            return;
          }
          const parsed = publicEvidenceSchema.safeParse({
            source,
            label,
            context,
            observedAt: `${date}T00:00:00Z`,
            skills,
            ...(source === "self-report" ? { claimedLevel: level } : { url }),
          });
          if (!parsed.success) {
            setError(
              "Choose at least one skill and check the fields. Portfolio references require HTTPS without credentials.",
            );
            return;
          }
          setError("");
          void onSave(parsed.data);
        }}
      >
        <fieldset disabled={busy} className="profile-form-fields">
          <div className="profile-field">
            <label htmlFor={`${formId}-source`}> Evidence type</label>
            <select
              id={`${formId}-source`}
              className="text-input"
              value={source}
              disabled={!!initial}
              onChange={(e) => setSource(e.target.value as typeof source)}
            >
              <option value="self-report">Self-report</option>
              <option value="portfolio-reference">Portfolio reference</option>
            </select>
          </div>
          <div className="profile-field">
            <label htmlFor={`${formId}-label`}> Evidence label</label>
            <input
              id={`${formId}-label`}
              className="text-input"
              required
              maxLength={160}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="profile-field">
            <label htmlFor={`${formId}-context`}> Context</label>
            <textarea
              id={`${formId}-context`}
              className="text-input"
              maxLength={2000}
              value={context}
              onChange={(e) => setContext(e.target.value)}
            />
          </div>
          <div className="profile-field">
            <label htmlFor={`${formId}-date`}> Observation date</label>
            <input
              id={`${formId}-date`}
              className="text-input"
              type="date"
              required
              max={new Date().toISOString().slice(0, 10)}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <fieldset className="profile-options">
            <legend>Related skills</legend>
            {skillOptions.map(({ id: skill, nameEn, status }) => (
              <label key={skill}>
                <input
                  type="checkbox"
                  checked={skills.includes(skill)}
                  onChange={(e) =>
                    setSkills(
                      e.target.checked ? [...skills, skill] : skills.filter((s) => s !== skill),
                    )
                  }
                />
                {nameEn}
              </label>
            ))}
          </fieldset>
          {source === "self-report" ? (
            <div className="profile-field">
              <label htmlFor={`${formId}-level`}> Self-reported experience</label>
              <select
                id={`${formId}-level`}
                className="text-input"
                value={level}
                onChange={(e) => setLevel(Number(e.target.value))}
              >
                <option value={0}>Exploring</option>
                <option value={1}>Practiced with guidance</option>
                <option value={2}>Applied independently</option>
                <option value={3}>Applied in several contexts</option>
              </select>
            </div>
          ) : (
            <div className="profile-field">
              <label htmlFor={`${formId}-url`}> Portfolio URL</label>
              <input
                id={`${formId}-url`}
                className="text-input"
                type="url"
                required
                maxLength={2048}
                placeholder="https://example.com/project"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
          )}
          {error && <p role="alert">{error}</p>}
          <div className="button-row">
            <button className="button primary" type="submit">
              {initial ? "Save evidence version" : "Add evidence"}
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
