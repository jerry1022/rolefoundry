"use client";
import Link from "next/link";
import {
  ArrowUpRight,
  BrainCircuit,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  Code2,
  Database,
  FlaskConical,
  Palette,
  ScanEye,
  ServerCog,
  Workflow,
} from "lucide-react";
import { careerPaths, type CareerPathId } from "@/lib/career-paths";
import { msg, useI18n } from "@/lib/i18n";

const icons = {
  "ai-llm-applications": Code2,
  "machine-learning": BrainCircuit,
  "data-analytics-science": ChartNoAxesCombined,
  "data-engineering": Database,
  "mlops-platform": ServerCog,
  "computer-vision-edge": ScanEye,
  "ai-product-consulting": BriefcaseBusiness,
  "ai-automation-operations": Workflow,
  "ai-research": FlaskConical,
  "ai-design-content": Palette,
};

/** Explicit message keys keep plural forms translatable instead of concatenated. */
function roleCountMessage(kind: "sample" | "published", count: number) {
  if (kind === "published")
    return count === 1 ? msg("{n} published role") : msg("{n} published roles");
  return count === 1 ? msg("{n} sample role") : msg("{n} sample roles");
}

export function CareerPathBrowser({
  selected,
  counts,
  onSelect,
  countLabel = "sample",
}: {
  selected: CareerPathId | "all";
  counts: Record<CareerPathId, number>;
  onSelect: (path: CareerPathId | "all") => void;
  countLabel?: "sample" | "published";
}) {
  const { t } = useI18n();
  const current = careerPaths.find((path) => path.id === selected);
  return (
    <section className="career-path-section" aria-labelledby="career-path-heading">
      <div className="section-heading">
        <div>
          <h2 id="career-path-heading">{t("Explore AI career paths")}</h2>
          <p>
            {t(
              "The original nine career directions, plus design & content. Choose one to see its guide and roles.",
            )}
          </p>
        </div>
        <button
          className={`filter-button ${selected === "all" ? "selected" : ""}`}
          aria-pressed={selected === "all"}
          onClick={() => onSelect("all")}
        >
          {t("All specializations")}
        </button>
      </div>
      <div className="career-path-grid" role="group" aria-label={t("AI career specializations")}>
        {careerPaths.map((path) => {
          const Icon = icons[path.id];
          return (
            <button
              key={path.id}
              className={`career-path-card ${selected === path.id ? "selected" : ""}`}
              aria-pressed={selected === path.id}
              onClick={() => onSelect(path.id)}
            >
              <span className="career-path-card-top">
                <Icon size={19} />
                <span>{counts[path.id]}</span>
              </span>
              <strong>{t(path.title)}</strong>
              <small>
                {t(roleCountMessage(countLabel, counts[path.id]), { n: counts[path.id] })}
              </small>
            </button>
          );
        })}
      </div>
      {current && (
        <article className="career-guide panel" aria-labelledby="selected-career-heading">
          <div className="career-guide-heading">
            <div>
              <p className="mini-label">{t("CAREER PATH GUIDE")}</p>
              <h2 id="selected-career-heading">{t(current.title)}</h2>
              <p>{current.work}</p>
            </div>
            <Link className="text-link" href="/learning/">
              {t("Browse the course catalog")}
              <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="career-guide-columns">
            <div>
              <h3>{t("Learning sequence")}</h3>
              <ol>
                {current.learning.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
            <div>
              <h3>{t("Evidence to build")}</h3>
              <ul>
                {current.evidence.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <h3>{t("A project to explore")}</h3>
              <p>{current.project}</p>
            </div>
          </div>
          <p className="career-guide-note">
            {t(
              "A starting framework from the career playbook. Actual job requirements and learning time vary; course completion alone does not verify ability.",
            )}
          </p>
        </article>
      )}
    </section>
  );
}
