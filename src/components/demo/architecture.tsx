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
      <div className="profile-grid section-block">
        <section className="panel">
          <h2>{t("What runs today")}</h2>
          <ul className="detail-list">
            <li>{t("Next.js routes and a responsive application shell.")}</li>
            <li>{t("Fixture-backed search, overlap matching and course ranking.")}</li>
            <li>{t("Scenario scoring and local evidence records.")}</li>
            <li>{t("Local resume editing, text export and an application board.")}</li>
            <li>
              {t("Optional invitation-only Auth, consent, RLS and atomic quota reservations.")}
            </li>
            <li>
              {t("Private preferences and evidence history through replaceable service ports.")}
            </li>
            <li>{t("Published catalog, source permissions/freshness and private bookmarks.")}</li>
            <li>{t("Typed repository, provider and worker contracts.")}</li>
          </ul>
        </section>
        <section className="panel">
          <h2>{t("What comes next")}</h2>
          <ul className="detail-list">
            <li>{t("Private document storage and account-backed career workflows.")}</li>
            <li>{t("Authorized live source adapters and import review workflows.")}</li>
            <li>{t("Persistent queues and isolated document processing.")}</li>
            <li>{t("Model adapters and output validation using versioned consent.")}</li>
            <li>{t("Production telemetry, backups and deployment controls.")}</li>
          </ul>
        </section>
      </div>
    </>
  );
}

function PanelsIcon() {
  return <Layers3 size={24} />;
}
