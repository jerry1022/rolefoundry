"use client";
import { PageHeading } from "../ui/page-heading";
import { useState } from "react";
import { Database, Network, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { courses, jobs, questions } from "@/lib/fixtures";
import { tracks, type Job } from "@/lib/domain";
import { useWorkspace } from "@/lib/workspace";
import { msg, useI18n } from "@/lib/i18n";
import { SectionHeading, Modal } from "./shared";
import { TableScroll } from "../ui/table-scroll";

export function AdminScreen() {
  const { reset } = useWorkspace();
  const { t } = useI18n();
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <PageHeading
        eyebrow={t("BEHIND THE POSSIBILITIES")}
        title={t("A thoughtful foundation.")}
        description={t("Inspect the sample catalog and the boundaries of this scaffold.")}
      />
      <div className="notice inline">
        <ShieldCheck size={19} />
        <span>
          {t(
            "This is a public, read-only demo inspector—not an authenticated admin service. Production access requires server-side authorization.",
          )}
        </span>
      </div>
      <div className="stats-grid admin-stats">
        {[
          { name: msg("Sample roles"), count: jobs.length },
          { name: msg("Official course links"), count: courses.length },
          { name: msg("Scenario questions"), count: questions.length },
          { name: msg("Career tracks"), count: tracks.length },
        ].map((s) => (
          <div className="stat-card" key={s.name}>
            <span className="mini-label">{t(s.name)}</span>
            <strong className="stat-number">{s.count}</strong>
          </div>
        ))}
      </div>
      <section className="panel">
        <SectionHeading
          title={t("Catalog provenance")}
          subtitle={t("A source trail should be part of the product, not an afterthought.")}
        />
        <TableScroll label={t("Catalog provenance")}>
          <table>
            <thead>
              <tr>
                <th>{t("Dataset")}</th>
                <th>{t("Source")}</th>
                <th>{t("Current state")}</th>
                <th>{t("Production requirement")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t("Job openings")}</td>
                <td>{t("Authored fictional fixtures")}</td>
                <td>
                  <span className="pill">{t("Demo only")}</span>
                </td>
                <td>{t("Authorized feeds, review and expiry")}</td>
              </tr>
              <tr>
                <td>{t("Course catalog")}</td>
                <td>{t("DeepLearning.AI official links")}</td>
                <td>
                  <span className="pill">{t("Editorial mapping")}</span>
                </td>
                <td>{t("Review links, prerequisites and availability")}</td>
              </tr>
              <tr>
                <td>{t("Assessments")}</td>
                <td>{t("Authored scenarios and fixed answers")}</td>
                <td>
                  <span className="pill">{t("Preview rubric")}</span>
                </td>
                <td>{t("Expert review and calibration")}</td>
              </tr>
              <tr>
                <td>{t("Personal data")}</td>
                <td>{t("Local demo browser state")}</td>
                <td>
                  <span className="pill">{t("No backend")}</span>
                </td>
                <td>{t("Account-backed career data and deletion")}</td>
              </tr>
            </tbody>
          </table>
        </TableScroll>
      </section>
      <section className="panel section-block">
        <SectionHeading title={t("Integration roadmap")} />
        <div className="roadmap-grid">
          {[
            {
              icon: Database,
              title: msg("Durable workspace"),
              text: msg(
                "Account identity is available when configured. Private career storage and deletion workflows follow.",
              ),
            },
            {
              icon: Network,
              title: msg("Background processing"),
              text: msg("pgmq queues, a Node worker, idempotent tasks and provider adapters."),
            },
            {
              icon: Sparkles,
              title: msg("Evidence-based analysis"),
              text: msg(
                "Schema-validated extraction and review, with versions, quotas and human confirmation.",
              ),
            },
          ].map((item) => (
            <div key={item.title} className="roadmap-item">
              <item.icon size={23} />
              <h3>{t(item.title)}</h3>
              <p>{t(item.text)}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="reset-panel">
        <div>
          <h3>{t("Start with a clean workspace")}</h3>
          <p>{t("Remove local edits, saved roles, scenario results and tracker entries.")}</p>
        </div>
        <button className="button secondary" onClick={() => setConfirm(true)}>
          <RotateCcw size={15} />
          {t("Reset demo")}
        </button>
      </section>
      {confirm && (
        <Modal title={t("Reset your local demo")} onClose={() => setConfirm(false)}>
          <h2>{t("Start fresh?")}</h2>
          <p>
            {t(
              "This removes your local demo changes and restores the sample profile. It does not affect any external account.",
            )}
          </p>
          <div className="button-row">
            <button className="button secondary" onClick={() => setConfirm(false)}>
              {t("Keep my changes")}
            </button>
            <button
              className="button primary"
              onClick={() => {
                reset();
                setConfirm(false);
              }}
            >
              {t("Reset local demo")}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
