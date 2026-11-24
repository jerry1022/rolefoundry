"use client";
import { PageHeading } from "../ui/page-heading";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, ShieldCheck, Target } from "lucide-react";
import { skillLabels, tracks, type Skill, type Track } from "@/lib/domain";
import { useWorkspace } from "@/lib/workspace";
import { useI18n } from "@/lib/i18n";
import { SectionHeading } from "./shared";

export function SkillsScreen() {
  const { state, update } = useWorkspace();
  const { t, fmt } = useI18n();
  return (
    <>
      <PageHeading
        eyebrow={t("MORE THAN A LIST OF TOOLS")}
        title={t("Make your skills tangible.")}
        description={t("Start with what you know. Add evidence as you learn, build and practice.")}
        action={
          <Link href="/assessments/" className="button primary">
            {t("Take a skill check")}
            <ArrowUpRight size={16} />
          </Link>
        }
      />
      <div className="profile-grid">
        <section className="panel">
          <SectionHeading
            title={t("Your starting point")}
            subtitle={t("Edit the demo profile. Changes are saved in this browser.")}
          />
          <label className="field-label">
            {t("First name")}
            <input
              className="text-input"
              value={state.name}
              maxLength={100}
              onChange={(e) => update((s) => ({ ...s, name: e.target.value }))}
            />
          </label>
          <label className="field-label">
            {t("Career direction")}
            <select
              className="text-input"
              value={state.track}
              onChange={(e) => update((s) => ({ ...s, track: e.target.value as Track }))}
            >
              {tracks.map((track) => (
                <option key={track} value={track}>
                  {t(track)}
                </option>
              ))}
            </select>
          </label>
          <div className="notice">
            <ShieldCheck size={20} />
            <p>
              {t(
                "Your profile is local to this browser. Use sample information; do not enter sensitive personal data.",
              )}
            </p>
          </div>
        </section>
        <section className="panel">
          <SectionHeading
            title={t("Your skill toolkit")}
            subtitle={t(
              "Select skills you have experience with. This is self-report, not verification.",
            )}
          />
          <div className="skill-checklist">
            {(Object.keys(skillLabels) as Skill[]).map((skill) => (
              <label key={skill} className={state.knownSkills.includes(skill) ? "checked" : ""}>
                <input
                  type="checkbox"
                  checked={state.knownSkills.includes(skill)}
                  onChange={(e) =>
                    update((s) => ({
                      ...s,
                      knownSkills: e.target.checked
                        ? [...s.knownSkills, skill]
                        : s.knownSkills.filter((v) => v !== skill),
                    }))
                  }
                />
                <span>{t(skillLabels[skill])}</span>
                <small>{t("Self-reported")}</small>
              </label>
            ))}
          </div>
        </section>
      </div>
      <section className="panel section-block">
        <SectionHeading
          title={t("Evidence, not just confidence")}
          subtitle={t("Scenario results are separate from self-reported experience.")}
        />
        {state.evidence.length ? (
          <div className="evidence-list">
            {state.evidence.map((e) => (
              <div key={`${e.skill}-${e.source}`} className="evidence-item">
                <span className="stat-icon mint">
                  <Target size={18} />
                </span>
                <div>
                  <strong>{t(skillLabels[e.skill])}</strong>
                  <p>
                    {e.level > 0 ? t("Correct in a short scenario") : t("Worth revisiting")} ·{" "}
                    {fmt.date(e.updatedAt)}
                  </p>
                </div>
                <span className="pill">{t("Scenario evidence")}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state compact-empty">
            <Target size={28} />
            <h3>{t("Your next proof point starts small.")}</h3>
            <p>{t("Complete a short scenario check to add evidence here.")}</p>
            <Link className="text-link" href="/assessments/">
              {t("Try a skill check")}
              <ArrowRight size={15} />
            </Link>
          </div>
        )}
      </section>
    </>
  );
}
