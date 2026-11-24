"use client";
import { PageHeading } from "../ui/page-heading";
import { useState } from "react";
import { ArrowDownToLine, ArrowRight, Check, FileText, Sparkles, Target } from "lucide-react";
import { jobs } from "@/lib/fixtures";
import { localizedDemoJob } from "@/lib/fixtures-locale";
import { skillLabels } from "@/lib/domain";
import { useWorkspace } from "@/lib/workspace";
import { useI18n } from "@/lib/i18n";
import { SectionHeading } from "./shared";

export function ResumeScreen() {
  const { state, update } = useWorkspace();
  const { t, fmt, locale } = useI18n();
  const [targetId, setTargetId] = useState(jobs[0].id);
  const [review, setReview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const target = jobs.find((j) => j.id === targetId)!;
  function download() {
    const url = URL.createObjectURL(new Blob([state.resume], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "rolefoundry-resume.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <PageHeading
        eyebrow={t("YOUR EXPERIENCE, BETTER EXPRESSED")}
        title={t("Give your story some shape.")}
        description={t("Connect real experience to the role you want. Keep the facts yours.")}
        action={
          <button className="button secondary" onClick={download}>
            <ArrowDownToLine size={16} />
            {t("Export text")}
          </button>
        }
      />
      <div className="notice inline">
        <FileText size={18} />
        <span>
          {t(
            "Local text workspace. AI rewriting, file parsing and PDF export are designed, but not connected in this scaffold.",
          )}
        </span>
      </div>
      <div className="resume-layout">
        <section className="panel resume-editor">
          <SectionHeading
            title={t("Your working draft")}
            subtitle={t("Use sample information. Edits are stored in this browser.")}
          />
          <label className="sr-only" htmlFor="resume-draft">
            {t("Resume draft")}
          </label>
          <textarea
            id="resume-draft"
            value={state.resume}
            maxLength={30000}
            onChange={(e) => {
              update((s) => ({ ...s, resume: e.target.value }));
              setReview(false);
            }}
          />
          <div className="editor-footer">
            <span>
              {t("{count} / {max} characters", {
                count: fmt.number(state.resume.length),
                max: fmt.number(30000),
              })}
            </span>
            <span>
              <span className="status-dot" />
              {t("Saved locally")}
            </span>
          </div>
        </section>
        <aside className="panel resume-review">
          <span className="large-icon">
            <Sparkles size={25} />
          </span>
          <h2>{t("A clearer connection.")}</h2>
          <p>
            {t(
              "Review your draft alongside a sample role. These are deterministic prompts, not AI-generated claims.",
            )}
          </p>
          <label className="field-label">
            {t("Target role")}
            <select
              className="text-input"
              value={targetId}
              onChange={(e) => {
                setTargetId(e.target.value);
                setReview(false);
              }}
            >
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {localizedDemoJob(j, locale).title}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button primary full-width"
            disabled={!state.resume.trim()}
            onClick={() => setReview(true)}
          >
            {t("Review my draft")}
            <ArrowRight size={16} />
          </button>
          {review && (
            <div className="review-results" role="status">
              <h3>{t("Your review checklist")}</h3>
              {target.skills.map((s) => (
                <div className="review-item" key={s}>
                  <Target size={16} />
                  <p>
                    <strong>{t(skillLabels[s])}</strong>
                    <br />
                    {state.resume.toLowerCase().includes(s)
                      ? t("Mentioned in your draft. Add a concrete example and your contribution.")
                      : t(
                          "Not clearly evidenced. Add a real example if you have one; otherwise leave it as a learning goal.",
                        )}
                  </p>
                </div>
              ))}
              <div className="notice">
                <p>
                  {t(
                    "Use: problem → your action → observed result → evidence. Add numbers only when you measured them.",
                  )}
                </p>
              </div>
            </div>
          )}
          <button
            className="text-link copy-link"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(state.resume);
                setCopied(true);
                setCopyError(false);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                setCopyError(true);
              }
            }}
          >
            {copied ? <Check size={15} /> : <FileText size={15} />}
            {copied ? t("Copied to clipboard") : t("Copy draft")}
          </button>
          {copyError && (
            <p role="status" className="fine-print">
              {t("Clipboard access unavailable. Select the draft text or use Export text.")}
            </p>
          )}
        </aside>
      </div>
    </>
  );
}
