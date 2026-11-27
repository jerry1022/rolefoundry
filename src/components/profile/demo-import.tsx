"use client";
import { useState } from "react";
import { skillLabels } from "@/modules/skills/catalog";
import { workspaceSchema, type Workspace } from "@/lib/domain";
import type { ProfileClient } from "@/modules/profile/ports";

export function DemoImport({
  busy,
  onImport,
}: {
  busy: boolean;
  onImport: (value: Parameters<ProfileClient["importDemo"]>[0]) => Promise<void>;
}) {
  const [preview, setPreview] = useState<Workspace | null>(null);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="panel section-block">
      <h2>Bring selected demo data into this account</h2>
      <p className="muted">
        Optional, available only before the first account edit. Review what will be sent. Resume
        drafts, bookmarks, local scenario results and tracker notes are excluded.
      </p>
      {!preview ? (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => {
            try {
              const raw = localStorage.getItem("rolefoundry.workspace.v1");
              if (!raw) throw new Error();
              setPreview(workspaceSchema.parse(JSON.parse(raw)));
              setError("");
            } catch {
              setError("No compatible saved demo was found, or browser storage is unavailable.");
            }
          }}
        >
          Preview demo import
        </button>
      ) : (
        <>
          <dl>
            <dt>Name</dt>
            <dd>{preview.name || "Not supplied"}</dd>
            <dt>Direction</dt>
            <dd>{preview.track}</dd>
            <dt>Skills to import as self-reports</dt>
            <dd>{preview.knownSkills.map((skill) => skillLabels[skill]).join(", ") || "None"}</dd>
          </dl>
          <label className="profile-consent">
            <input
              type="checkbox"
              checked={approved}
              disabled={busy}
              onChange={(e) => setApproved(e.target.checked)}
            />
            I approve uploading these preferences and self-reported skills to my account.
          </label>
          <button
            className="button primary"
            disabled={busy || !approved}
            onClick={() =>
              void onImport({
                expectedRevision: 0,
                preferences: {
                  name: preview.name,
                  track: preview.track,
                  workplaces: [],
                  weeklyHours: 5,
                },
                skills: preview.knownSkills,
              })
            }
          >
            Import reviewed data
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
