"use client";
import { useState } from "react";
import Link from "next/link";
import { labelsForLocale, skillLabel } from "@/modules/skills/model";
import type { CapabilityEvidence } from "@/modules/profile/model";
import { msg, useI18n } from "@/lib/i18n";
const sourceLabels = {
  "self-report": msg("Self-report"),
  "portfolio-reference": msg("Portfolio reference"),
  scenario: msg("Scenario response"),
  "resume-claim": msg("Resume claim"),
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
  const { t, locale } = useI18n();
  const labels = labelsForLocale(locale, {
    en: evidence.skillLabels,
    zhTw: evidence.skillLabelsZhTw,
  });
  const [confirm, setConfirm] = useState(false);
  const [history, setHistory] = useState<CapabilityEvidence[] | null>(null);
  const [error, setError] = useState("");
  return (
    <article className="panel profile-evidence-card">
      <div className="profile-evidence-header">
        <span className="pill">
          {t(sourceLabels[evidence.source])} · {evidence.reviewState}
        </span>
        <small>{t("Version {version}", { version: evidence.version })}</small>
      </div>
      <h3>{evidence.label}</h3>
      <p className="profile-preserve-text">{evidence.context}</p>
      <div className="tags">
        {evidence.skills.map((skill) => (
          <span className="skill-tag" key={skill}>
            {skillLabel(skill, labels)}
          </span>
        ))}
      </div>
      <p className="muted">
        {evidence.rubricVersion
          ? t("Observed {date} · Source {source} · Rubric {rubric}", {
              date: evidence.observedAt.slice(0, 10),
              source: evidence.sourceVersion,
              rubric: evidence.rubricVersion,
            })
          : t("Observed {date} · Source {source}", {
              date: evidence.observedAt.slice(0, 10),
              source: evidence.sourceVersion,
            })}
      </p>
      {evidence.outcome && <p className="profile-preserve-text">{evidence.outcome}</p>}
      {evidence.source === "resume-claim" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          evidence.sourceVersion,
        ) && (
          <Link className="text-link" href={`/resume/?version=${evidence.sourceVersion}`}>
            {t("View confirmed resume source")}
          </Link>
        )}
      {evidence.claimedLevel !== null && (
        <p>
          {t("Self-reported experience: {level}/3. This is a claim.", {
            level: evidence.claimedLevel,
          })}
        </p>
      )}
      {evidence.url && (
        <a
          className="text-link profile-reference"
          href={evidence.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("Open portfolio reference ↗")}
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
              .catch(() => setError(msg("Unable to load evidence history.")));
          }}
        >
          {t("View history")}
        </button>
        {["self-report", "portfolio-reference"].includes(evidence.source) && (
          <button className="button secondary" disabled={busy} onClick={onEdit}>
            {t("Edit evidence")}
          </button>
        )}
        <button className="button secondary" disabled={busy} onClick={() => setConfirm(!confirm)}>
          {t("Delete evidence")}
        </button>
      </div>
      {confirm && (
        <div className="notice profile-delete">
          <p>
            {t(
              "Delete this evidence and all its versions? Recommendations based on it will need refreshing.",
            )}
          </p>
          <button className="button secondary" disabled={busy} onClick={() => void onDelete()}>
            {t("Confirm deletion")}
          </button>
        </div>
      )}
      {error && <p role="alert">{t(error)}</p>}
      {history && (
        <div className="profile-history">
          <h4>{t("Evidence history")}</h4>
          {history.map((version) => (
            <div key={version.versionId}>
              <strong>
                {t("Version {version}", { version: version.version })} · {version.label}
              </strong>
              <p className="profile-preserve-text">{version.context}</p>
              <small>
                {version.createdAt.slice(0, 10)} · {version.reviewState}
              </small>
            </div>
          ))}
          <button className="text-link" onClick={() => setHistory(null)}>
            {t("Close history")}
          </button>
        </div>
      )}
    </article>
  );
}
