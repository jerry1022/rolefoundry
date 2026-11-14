"use client";
import { useId, useState } from "react";
import { tracks } from "@/modules/skills/catalog";
import type { CareerProfile, Preferences } from "@/modules/profile/model";

export function PreferencesForm({
  profile,
  busy,
  onSave,
}: {
  profile: CareerProfile;
  busy: boolean;
  onSave: (value: Preferences) => Promise<void>;
}) {
  const formId = useId();
  const [form, setForm] = useState<Preferences>({
    name: profile.name,
    track: profile.track,
    workplaces: profile.workplaces,
    weeklyHours: profile.weeklyHours,
  });
  return (
    <section className="panel">
      <h2>Career preferences</h2>
      <p className="muted">Saved privately to this account. Revision {profile.revision}.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(form);
        }}
      >
        <fieldset disabled={busy} className="profile-form-fields">
          <div className="profile-field">
            <label htmlFor={`${formId}-name`}> Display name</label>
            <input
              id={`${formId}-name`}
              className="text-input"
              value={form.name}
              maxLength={100}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="profile-field">
            <label htmlFor={`${formId}-track`}> Career direction</label>
            <select
              id={`${formId}-track`}
              className="text-input"
              value={form.track}
              onChange={(e) => setForm({ ...form, track: e.target.value as Preferences["track"] })}
            >
              {tracks.map((track) => (
                <option key={track}>{track}</option>
              ))}
            </select>
          </div>
          <div className="profile-field">
            <label htmlFor={`${formId}-hours`}> Weekly learning hours</label>
            <input
              id={`${formId}-hours`}
              className="text-input"
              type="number"
              min={0}
              max={80}
              required
              value={form.weeklyHours}
              onChange={(e) => setForm({ ...form, weeklyHours: e.target.valueAsNumber })}
            />
          </div>
          <fieldset className="profile-options">
            <legend>Preferred workplaces</legend>
            {(["Remote", "Hybrid", "On-site"] as const).map((mode) => (
              <label key={mode}>
                <input
                  type="checkbox"
                  checked={form.workplaces.includes(mode)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      workplaces: e.target.checked
                        ? [...form.workplaces, mode]
                        : form.workplaces.filter((v) => v !== mode),
                    })
                  }
                />
                {mode}
              </label>
            ))}
          </fieldset>
          <button className="button primary" type="submit">
            Save preferences
          </button>
        </fieldset>
      </form>
    </section>
  );
}
