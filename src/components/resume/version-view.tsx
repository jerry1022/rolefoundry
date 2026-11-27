"use client";
import { useI18n } from "@/lib/i18n";
import type { ResumeVersion } from "@/modules/resume/model";
import { localizedSkillName, type SkillDictionary } from "@/modules/skills/model";
export function ResumeVersionView({
  version,
  dictionary,
}: {
  version: ResumeVersion;
  dictionary: SkillDictionary | null;
}) {
  const { t, locale } = useI18n();
  const labels = new Map(
    (dictionary?.skills || []).map(
      (skill) => [skill.id, localizedSkillName(skill, locale)] as const,
    ),
  );
  return (
    <section className="panel section-block">
      <h2>{t("Confirmed version {version}", { version: version.version })}</h2>
      <p className="muted">
        {t("Saved {date}. This version is immutable. Later edits create separate versions.", {
          date: version.createdAt.slice(0, 10),
        })}
      </p>
      {version.content.sections.map((section) => (
        <section className="section-block" key={section.id}>
          <h3>{section.heading}</h3>
          {section.factIds.map((id) => {
            const fact = version.content.facts.find((fact) => fact.id === id)!;
            return (
              <article className="resume-version-statement" key={id}>
                <p className="pill">
                  {fact.state === "learning"
                    ? t("Learning goal")
                    : fact.state === "in-progress"
                      ? t("In progress")
                      : fact.state === "completed"
                        ? t("Owner-reported complete")
                        : t("Owner-confirmed statement")}
                </p>
                <p className="resume-preserve-text">{fact.text}</p>
                <div className="tags">
                  {fact.skillIds.map((skill) => (
                    <span className="skill-tag" key={skill}>
                      {labels.get(skill) || skill}
                    </span>
                  ))}
                </div>
              </article>
            );
          })}
        </section>
      ))}
    </section>
  );
}
