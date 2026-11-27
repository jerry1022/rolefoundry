"use client";
import { useState } from "react";
import Link from "next/link";
import { skillLabel } from "@/modules/skills/model";
import type { CapabilityEvidence } from "@/modules/profile/model";
const sourceLabels = {
  "self-report": "Self-report",
  "portfolio-reference": "Portfolio reference",
  scenario: "Scenario response",
  "resume-claim": "Resume claim",
};
export function EvidenceCard({
  evidence,
  busy,
  onEdit,
  onDelete,
  onHistory,
}: {
  evidence: CapabilityEvidence;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  onHistory: () => Promise<CapabilityEvidence[]>;
}) {
  const [confirm, setConfirm] = useState(false);
  const [history, setHistory] = useState<CapabilityEvidence[] | null>(null);
  const [error, setError] = useState("");
  return (
    <article className="panel profile-evidence-card">
      <div className="profile-evidence-header">
        <span className="pill">
          {sourceLabels[evidence.source]} · {evidence.reviewState}
        </span>
        <small>Version {evidence.version}</small>
      </div>
      <h3>{evidence.label}</h3>
      <p className="profile-preserve-text">{evidence.context}</p>
      <div className="tags">
        {evidence.skills.map((skill) => (
          <span className="skill-tag" key={skill}>
            {skillLabel(skill, evidence.skillLabels)}
          </span>
        ))}
      </div>
      <p className="muted">
        Observed {evidence.observedAt.slice(0, 10)} · Source {evidence.sourceVersion}
        {evidence.rubricVersion ? ` · Rubric ${evidence.rubricVersion}` : ""}
      </p>
      {evidence.outcome && <p className="profile-preserve-text">{evidence.outcome}</p>}
      {evidence.source === "resume-claim" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          evidence.sourceVersion,
        ) && (
          <Link className="text-link" href={`/resume/?version=${evidence.sourceVersion}`}>
            View confirmed resume source
          </Link>
        )}
      {evidence.claimedLevel !== null && (
        <p>Self-reported experience: {evidence.claimedLevel}/3. This is a claim.</p>
      )}
      {evidence.url && (
        <a
          className="text-link profile-reference"
          href={evidence.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open portfolio reference ↗
        </a>
      )}
      <div className="button-row">
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => {
            setError("");
            void onHistory()
              .then(setHistory)
              .catch(() => setError("Unable to load evidence history."));
          }}
        >
          View history
        </button>
        {["self-report", "portfolio-reference"].includes(evidence.source) && (
          <button className="button secondary" disabled={busy} onClick={onEdit}>
            Edit evidence
          </button>
        )}
        <button className="button secondary" disabled={busy} onClick={() => setConfirm(!confirm)}>
          Delete evidence
        </button>
      </div>
      {confirm && (
        <div className="notice profile-delete">
          <p>
            Delete this evidence and all its versions? Recommendations based on it will need
            refreshing.
          </p>
          <button className="button secondary" disabled={busy} onClick={() => void onDelete()}>
            Confirm deletion
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {history && (
        <div className="profile-history">
          <h4>Evidence history</h4>
          {history.map((version) => (
            <div key={version.versionId}>
              <strong>
                Version {version.version} · {version.label}
              </strong>
              <p className="profile-preserve-text">{version.context}</p>
              <small>
                {version.createdAt.slice(0, 10)} · {version.reviewState}
              </small>
            </div>
          ))}
          <button className="text-link" onClick={() => setHistory(null)}>
            Close history
          </button>
        </div>
      )}
    </article>
  );
}
