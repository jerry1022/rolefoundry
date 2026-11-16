"use client";
import { useState } from "react";
import type { ResumeProposal } from "@/modules/resume/model";
export function ResumeProposalView({
  proposal,
  busy,
  onAccept,
  onVersion,
}: {
  proposal: ResumeProposal;
  busy: boolean;
  onAccept: (ids: string[]) => Promise<void>;
  onVersion: (id: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>(() => proposal.acceptedIds || []);
  const locked = busy || proposal.stale || proposal.status !== "succeeded";
  return (
    <section className="panel section-block">
      <h2>Review suggested changes</h2>
      <p className="muted">
        This deterministic fallback reorders exact confirmed statements for the target role. It does
        not write new claims or give an ATS score.
      </p>
      {proposal.stale && (
        <p className="notice" role="status">
          This proposal uses earlier inputs. Create a fresh proposal before accepting changes.
        </p>
      )}
      {proposal.status === "accepted" && (
        <p className="notice">
          Your individual choices were saved as a new version.{" "}
          <button
            className="text-link"
            onClick={() => proposal.acceptedVersionId && onVersion(proposal.acceptedVersionId)}
          >
            View accepted version
          </button>
        </p>
      )}
      {!proposal.output && (
        <p role="status">
          {["queued", "running"].includes(proposal.status)
            ? "The worker is preparing this proposal."
            : "No proposal was published. Your confirmed source is unchanged."}
        </p>
      )}
      {proposal.output && (
        <>
          <div className="resume-proposal-changes">
            {proposal.output.changes.map((change) => (
              <article className="resume-change-card" key={change.id}>
                <label className="resume-change-select">
                  <input
                    aria-label="Accept this change"
                    type="checkbox"
                    disabled={locked}
                    checked={
                      proposal.status === "accepted"
                        ? (proposal.acceptedIds || []).includes(change.id)
                        : selected.includes(change.id)
                    }
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? [...selected, change.id]
                          : selected.filter((id) => id !== change.id),
                      )
                    }
                  />
                  Use this change
                </label>
                <p>{change.reason}</p>
                <div className="resume-diff">
                  <section>
                    <h3>Before</h3>
                    <p className="resume-preserve-text">{change.beforeText}</p>
                  </section>
                  <section>
                    <h3>After</h3>
                    <p className="resume-preserve-text">{change.afterText}</p>
                  </section>
                </div>
              </article>
            ))}
          </div>
          {!proposal.output.changes.length && (
            <p>
              The existing statement order already fits this rule-based suggestion. No wording was
              invented.
            </p>
          )}
          {proposal.status === "succeeded" && (
            <button
              className="button primary"
              disabled={locked}
              onClick={() => void onAccept(selected)}
            >
              Save selected changes as a new version
            </button>
          )}
          {!!proposal.output.questions.length && (
            <section className="section-block">
              <h3>Questions for missing evidence</h3>
              {proposal.output.questions.map((question) => (
                <p key={question.skillId}>
                  <strong>{question.skillId}</strong> · {question.prompt}
                </p>
              ))}
            </section>
          )}
          <details>
            <summary>Suggestion limits</summary>
            {proposal.output.limitations.map((text) => (
              <p key={text}>{text}</p>
            ))}
          </details>
        </>
      )}
    </section>
  );
}
