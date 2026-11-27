"use client";
import type { ResumeVersion } from "@/modules/resume/model";
import type { SkillDictionary } from "@/modules/skills/model";
export function ResumeVersionView({
  version,
  dictionary,
}: {
  version: ResumeVersion;
  dictionary: SkillDictionary | null;
}) {
  const labels = new Map(
    (dictionary?.skills || []).map((skill) => [skill.id, skill.nameEn] as const),
  );
  return (
    <section className="panel section-block">
      <h2>Confirmed version {version.version}</h2>
      <p className="muted">
        Saved {version.createdAt.slice(0, 10)}. This version is immutable. Later edits create
        separate versions.
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
                    ? "Learning goal"
                    : fact.state === "in-progress"
                      ? "In progress"
                      : fact.state === "completed"
                        ? "Owner-reported complete"
                        : "Owner-confirmed statement"}
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
