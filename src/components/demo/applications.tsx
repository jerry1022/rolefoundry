"use client";
import { PageHeading } from "../ui/page-heading";
import { useState } from "react";
import { BriefcaseBusiness, Plus, Trash2 } from "lucide-react";
import { jobs } from "@/lib/fixtures";
import { localizedDemoJob } from "@/lib/fixtures-locale";
import { stages, type Stage, type Track } from "@/lib/domain";
import { useWorkspace } from "@/lib/workspace";
import { useI18n } from "@/lib/i18n";
import { Modal } from "./shared";

export function ApplicationsScreen() {
  const { state, update } = useWorkspace();
  const { t, locale } = useI18n();
  const [adding, setAdding] = useState(false);
  const [jobId, setJobId] = useState(jobs[0].id);
  function add() {
    update((s) => ({
      ...s,
      applications: s.applications.some((a) => a.jobId === jobId)
        ? s.applications
        : [...s.applications, { jobId, stage: "Saved", note: "" }],
    }));
    setAdding(false);
  }
  return (
    <>
      <PageHeading
        eyebrow={t("ONE PLACE FOR YOUR NEXT MOVES")}
        title={t("Keep your possibilities moving.")}
        description={t(
          "A simple, manual tracker. Visiting a job link never counts as an application.",
        )}
        action={
          <button className="button primary" onClick={() => setAdding(true)}>
            <Plus size={16} />
            {t("Track a role")}
          </button>
        }
      />
      <div className="pipeline-summary">
        <div>
          <strong>{state.applications.length.toString().padStart(2, "0")}</strong>
          <span>{t("roles in your pipeline")}</span>
        </div>
        <p>
          {t("Small follow-ups make a difference.")}
          <br />
          {t("Add a note about your next step.")}
        </p>
        <BriefcaseBusiness size={35} strokeWidth={1.3} />
      </div>
      <div className="kanban">
        {stages.map((stage) => {
          const entries = state.applications.filter((a) => a.stage === stage);
          return (
            <section className="kanban-column" key={stage}>
              <h2>
                <span className={`stage-dot stage-${stage.toLowerCase()}`} />
                {t(stage)}
                <span className="column-count">{entries.length}</span>
              </h2>
              {entries.map((entry) => {
                const found = jobs.find((j) => j.id === entry.jobId);
                if (!found) return null;
                const job = localizedDemoJob(found, locale);
                return (
                  <article className="application-card" key={entry.jobId}>
                    <div className="application-card-top">
                      <span className={`company-logo small ${job.color}`}>{job.initials}</span>
                      <button
                        className="icon-button"
                        aria-label={t("Remove {title} from tracker", { title: job.title })}
                        onClick={() =>
                          update((s) => ({
                            ...s,
                            applications: s.applications.filter((a) => a.jobId !== job.id),
                          }))
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <small>{job.company}</small>
                    <h3>{job.title}</h3>
                    <label className="sr-only" htmlFor={`stage-${job.id}`}>
                      {t("Stage for {title}", { title: job.title })}
                    </label>
                    <select
                      id={`stage-${job.id}`}
                      value={entry.stage}
                      onChange={(e) =>
                        update((s) => ({
                          ...s,
                          applications: s.applications.map((a) =>
                            a.jobId === job.id ? { ...a, stage: e.target.value as Stage } : a,
                          ),
                        }))
                      }
                    >
                      {stages.map((s) => (
                        <option key={s} value={s}>
                          {t(s)}
                        </option>
                      ))}
                    </select>
                    <label className="sr-only" htmlFor={`note-${job.id}`}>
                      {t("Note for {title}", { title: job.title })}
                    </label>
                    <textarea
                      id={`note-${job.id}`}
                      placeholder={t("Next step or a note…")}
                      value={entry.note}
                      maxLength={3000}
                      onChange={(e) =>
                        update((s) => ({
                          ...s,
                          applications: s.applications.map((a) =>
                            a.jobId === job.id ? { ...a, note: e.target.value } : a,
                          ),
                        }))
                      }
                    />
                    <span className="fine-print">{t("Sample role · manual status")}</span>
                  </article>
                );
              })}
              {!entries.length && (
                <div className="kanban-empty">{t("Room for your next move.")}</div>
              )}
            </section>
          );
        })}
      </div>
      {adding && (
        <Modal title={t("Track a sample role")} onClose={() => setAdding(false)}>
          <span className="large-icon">
            <BriefcaseBusiness size={25} />
          </span>
          <h2>{t("Keep a possibility in view.")}</h2>
          <p className="muted">
            {t("Add a sample role to your local tracker. This does not send an application.")}
          </p>
          <label className="field-label">
            {t("Sample role")}
            <select className="text-input" value={jobId} onChange={(e) => setJobId(e.target.value)}>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {localizedDemoJob(j, locale).title} · {j.company}
                </option>
              ))}
            </select>
          </label>
          <button className="button primary" onClick={add}>
            {t("Add to tracker")}
            <Plus size={16} />
          </button>
        </Modal>
      )}
    </>
  );
}
