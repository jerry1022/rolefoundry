"use client";
import { PageHeading } from "../ui/page-heading";
import { ArrowUpRight, Database, FileText, Layers3, Network, Sparkles } from "lucide-react";
import { type Job, type Skill } from "@/lib/domain";
import { msg, useI18n } from "@/lib/i18n";

export function ArchitectureScreen() {
  const { t } = useI18n();
  return (
    <>
      <PageHeading
        eyebrow={t("OPEN BY DESIGN")}
        title={t("One connected career system.")}
        description={t(
          "A modular foundation built around shared skills, traceable evidence and clear service boundaries.",
        )}
        action={
          <a
            href="https://github.com/jerry1022/rolefoundry/tree/main/docs"
            className="button secondary"
            target="_blank"
            rel="noreferrer"
          >
            {t("Read the design docs")}
            <ArrowUpRight size={16} />
          </a>
        }
      />
      <div className="architecture-map">
        <div className="arch-tier">
          <span className="mini-label">{t("EXPERIENCE")}</span>
          <div className="arch-node primary-node">
            <PanelsIcon />
            <strong>{t("Next.js web application")}</strong>
            <span>{t("Public catalog · personal workspace · admin")}</span>
          </div>
        </div>
        <div className="arch-connector">
          ↓<small>{t("Typed service interfaces")}</small>
        </div>
        <div className="arch-tier">
          <span className="mini-label">{t("DOMAIN MODULES")}</span>
          <div className="arch-modules">
            {[
              msg("Identity & access"),
              msg("Profile & evidence"),
              msg("Job catalog"),
              msg("Skill dictionary"),
              msg("Assessment"),
              msg("Matching & gaps"),
              msg("Courses & learning"),
              msg("Resume studio"),
              msg("Application tracker"),
            ].map((name) => (
              <div key={name}>{t(name)}</div>
            ))}
          </div>
        </div>
        <div className="arch-connector">
          ↓<small>{t("Repositories & task contracts")}</small>
        </div>
        <div className="arch-storage">
          <div className="arch-node">
            <Database size={24} />
            <strong>{t("PostgreSQL + pgvector")}</strong>
            <span>{t("Records · evidence · retrieval")}</span>
          </div>
          <div className="arch-node">
            <FileText size={24} />
            <strong>{t("Private Storage")}</strong>
            <span>{t("Resumes · exports")}</span>
          </div>
          <div className="arch-node">
            <Network size={24} />
            <strong>{t("Queue + Node worker")}</strong>
            <span>{t("Imports · parsing · analysis")}</span>
          </div>
        </div>
        <div className="arch-connector">
          ↓<small>{t("Server-side provider boundary")}</small>
        </div>
        <div className="arch-node provider-node">
          <Sparkles size={22} />
          <strong>{t("AI Gateway")}</strong>
          <span>{t("Structured output · versions · quotas · no live provider in demo")}</span>
        </div>
      </div>
      <div className="arch-status section-block">
        {STATUS.map((column) => (
          <section className={`panel arch-status-${column.tone}`} key={column.title}>
            <p className="mini-label">{t(column.label)}</p>
            <h2>{t(column.title)}</h2>
            <ul className="detail-list">
              {column.items.map((item) => (
                <li key={item}>{t(item)}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

function PanelsIcon() {
  return <Layers3 size={24} />;
}

/** Delivery status shown under the diagram; keep in step with docs/IMPLEMENTATION_AUDIT.md. */
const STATUS = [
  {
    tone: "demo",
    label: msg("NO ACCOUNT NEEDED"),
    title: msg("In this demo"),
    items: [
      msg("Fixture-backed search, overlap matching and course ranking."),
      msg("Scenario scoring and local evidence records."),
      msg("Local resume editing, text export and an application board."),
      msg("English and Traditional Chinese, light and dark themes."),
    ],
  },
  {
    tone: "backend",
    label: msg("IMPLEMENTED AND TESTED LOCALLY"),
    title: msg("With a configured backend"),
    items: [
      msg("Invitation-only Auth, consent, RLS and atomic quota reservations."),
      msg("Private evidence, assessments, matching, learning plans, resumes and applications."),
      msg("Durable queue and independent worker with leases, retries and recovery."),
      msg("Reviewed catalog ingestion, translations and administrator tools."),
      msg("Account export and deletion, telemetry and an AI gateway with fallbacks."),
    ],
  },
  {
    tone: "gated",
    label: msg("NEEDS PEOPLE OR HOSTING"),
    title: msg("Release gates"),
    items: [
      msg("Approved AI provider and live evaluation."),
      msg("Expert review of questions, rubrics and course mappings."),
      msg("Authorized live job sources."),
      msg("Hosted deployment, alerts and off-host recovery."),
    ],
  },
] as const;
