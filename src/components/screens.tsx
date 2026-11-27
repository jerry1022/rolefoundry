"use client";
import { PageHeading } from "./ui/page-heading";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  BookOpen,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  Code2,
  Database,
  ExternalLink,
  FileText,
  Filter,
  GraduationCap,
  Layers3,
  MapPin,
  Network,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sprout,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { courses, jobs, questions } from "@/lib/fixtures";
import {
  gradeAssessment,
  matchJob,
  recommendCourses,
  searchJobs,
  skillLabels,
  stages,
  tracks,
  type Job,
  type Skill,
  type Stage,
  type Track,
} from "@/lib/domain";
import { useWorkspace } from "@/lib/workspace";
import { msg, useI18n } from "@/lib/i18n";
import { careerPaths, getCareerPath, type CareerPathId } from "@/lib/career-paths";
import { CareerPathBrowser } from "./career-path-browser";

const workplaceOptions = [msg("Any workplace"), msg("Remote"), msg("Hybrid"), msg("On-site")];

/** Fixture salaries are authored as "NT$90k–140k / month"; re-render them per locale. */
function formatSalary(value: string, fmt: ReturnType<typeof useI18n>["fmt"]) {
  const match = /^NT\$(\d+)k–(\d+)k \/ month$/.exec(value);
  return match ? fmt.monthlyRange(Number(match[1]) * 1000, Number(match[2]) * 1000) : value;
}
/** Localized, locale-joined skill names ("Python and SQL"). */
function useSkillNames() {
  const { t, fmt } = useI18n();
  return (skills: readonly Skill[]) => fmt.list(skills.map((skill) => t(skillLabels[skill])));
}
function SectionHeading({
  title,
  subtitle,
  href,
  link,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  link?: string;
}) {
  const { t } = useI18n();
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {href && (
        <Link className="text-link" href={href}>
          {link || t("View all")}
          <ArrowRight size={16} />
        </Link>
      )}
    </div>
  );
}
function SkillTag({ skill, known }: { skill: Skill; known?: boolean }) {
  const { t } = useI18n();
  return (
    <span className={`skill-tag ${known ? "known" : ""}`}>
      {known && <Check size={11} />}
      {t(skillLabels[skill])}
    </span>
  );
}
function Modal({
  children,
  title,
  onClose,
}: {
  children: ReactNode;
  title: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={ref} className="modal" onCancel={onClose} aria-label={title}>
      <button className="icon-button modal-close" aria-label={t("Close details")} onClick={onClose}>
        <X size={20} />
      </button>
      {children}
    </dialog>
  );
}
function JobDetails({ job, onClose }: { job: Job; onClose: () => void }) {
  const { state, update } = useWorkspace();
  const { t } = useI18n();
  const skillNames = useSkillNames();
  const match = matchJob(job, state.knownSkills);
  const tracked = state.applications.some((a) => a.jobId === job.id);
  return (
    <Modal title={job.title} onClose={onClose}>
      <div className={`company-logo ${job.color}`}>{job.initials}</div>
      <p className="eyebrow modal-eyebrow">
        {job.company} · {t("ILLUSTRATIVE OPENING")}
      </p>
      <h2 className="modal-title">{job.title}</h2>
      <p className="muted">
        {t(job.location)} · {t(job.mode)} · {t(job.level)}
      </p>
      <p className="job-specialization">{t(getCareerPath(job.specialization).title)}</p>
      <p className="detail-summary">{job.summary}</p>
      <h3>{t("What you would work on")}</h3>
      <ul className="detail-list">
        {job.responsibilities.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <h3>{t("Your starting point")}</h3>
      <div className="tags">
        {job.skills.map((s) => (
          <SkillTag key={s} skill={s} known={state.knownSkills.includes(s)} />
        ))}
      </div>
      <div className="notice">
        <strong>{t("{n}% skill overlap", { n: match.coverage })}</strong>
        <p>
          {t("Based on your self-reported skills, not hiring probability.")}{" "}
          {match.missing.length
            ? t("Explore {skills} next.", {
                skills: skillNames(match.missing),
              })
            : t("Add scenario evidence to strengthen your profile.")}
        </p>
      </div>
      <div className="button-row">
        <button
          className="button primary"
          onClick={() =>
            update((s) => ({
              ...s,
              applications: tracked
                ? s.applications
                : [...s.applications, { jobId: job.id, stage: "Saved", note: "" }],
            }))
          }
        >
          {tracked ? <Check size={16} /> : <Plus size={16} />}
          {tracked ? t("In your tracker") : t("Add to tracker")}
        </button>
        <Link href="/learning/" className="button secondary" onClick={onClose}>
          {t("Find learning resources")}
          <ArrowUpRight size={16} />
        </Link>
      </div>
      <p className="fine-print">
        {t(
          "This company, opening and salary are sample data. No application is sent. Live job sources are part of the production roadmap.",
        )}
      </p>
    </Modal>
  );
}
function JobCard({
  job,
  compact = false,
  onOpen,
}: {
  job: Job;
  compact?: boolean;
  onOpen: (job: Job) => void;
}) {
  const { state, update } = useWorkspace();
  const { t, fmt } = useI18n();
  const saved = state.savedJobs.includes(job.id);
  const match = matchJob(job, state.knownSkills);
  return (
    <article className={`job-card ${compact ? "compact" : ""}`}>
      <div className="job-card-top">
        <div className={`company-logo ${job.color}`}>{job.initials}</div>
        <span className="job-company">
          {job.company}
          <small>{t(job.added)}</small>
        </span>
        <button
          className={`icon-button bookmark ${saved ? "saved" : ""}`}
          aria-label={
            saved
              ? t("Unsave {title}", { title: job.title })
              : t("Save {title}", { title: job.title })
          }
          aria-pressed={saved}
          onClick={() =>
            update((s) => ({
              ...s,
              savedJobs: saved
                ? s.savedJobs.filter((id) => id !== job.id)
                : [...s.savedJobs, job.id],
            }))
          }
        >
          <Bookmark size={19} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
      <button className="job-title-button" onClick={() => onOpen(job)}>
        <h3>{job.title}</h3>
      </button>
      {!compact && (
        <p className="job-specialization">{t(getCareerPath(job.specialization).title)}</p>
      )}
      <p className="job-location">
        <MapPin size={13} />
        {t(job.location)}
        <span>·</span>
        {t(job.mode)}
      </p>
      {!compact && <p className="job-summary">{job.summary}</p>}
      <div className="tags">
        {job.skills.slice(0, 3).map((skill) => (
          <SkillTag skill={skill} key={skill} known={state.knownSkills.includes(skill)} />
        ))}
      </div>
      <div className="job-card-bottom">
        <span>{compact ? t(job.level) : formatSalary(job.salary, fmt)}</span>
        <button className="match-label" onClick={() => onOpen(job)}>
          <span className="status-dot" />
          {t("{n}% overlap", { n: match.coverage })}
          <ArrowUpRight size={13} />
        </button>
      </div>
    </article>
  );
}

export function Dashboard() {
  const { state } = useWorkspace();
  const { t, fmt } = useI18n();
  const [selected, setSelected] = useState<Job | null>(null);
  const recommended = searchJobs(jobs, "", state.track, "Any workplace", state.knownSkills).slice(
    0,
    3,
  );
  const target = recommended[0];
  const gaps = target ? matchJob(target, state.knownSkills).missing : [];
  const nextCourse =
    recommendCourses(courses, gaps, state.knownSkills).find(
      (r) => !state.completedCourses.includes(r.course.id),
    )?.course || courses[1];
  return (
    <>
      <PageHeading
        eyebrow={t("YOUR CAREER, IN THE MAKING")}
        title={t("Good things ahead, {name}.", { name: state.name })}
        description={t("Find your direction. Build the skills. Make your next move.")}
        action={
          <Link href="/jobs/" className="button secondary">
            {t("Explore opportunities")}
            <ArrowUpRight size={16} />
          </Link>
        }
      />
      <section className="hero-panel">
        <div className="hero-content">
          <span className="hero-kicker">
            <span /> {t("FROM POTENTIAL TO POSSIBILITY")}
          </span>
          <h2>
            {t("Your next chapter")}
            <br />
            {t("starts with a little clarity.")}
          </h2>
          <p>
            {t("Discover AI roles that fit you, see where you can grow,")}
            <br className="desktop-br" /> {t("and turn your curiosity into a concrete next step.")}
          </p>
          <Link href="/assessments/" className="button dark">
            {t("Find my starting point")}
            <ArrowUpRight size={17} />
          </Link>
          <span className="hero-footnote">
            {t("A 3-question preview. No perfect answers required.")}
          </span>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="art-spark spark-one">✳</div>
          <div className="art-spark spark-two">✦</div>
          <div className="floating-label label-top">
            <CheckCircle2 size={15} />
            {t("A little more confidence")}
          </div>
          <div className="art-card">
            <span className="art-card-icon">
              <Sprout size={34} />
            </span>
            <span className="art-card-line">{t("YOUR NEXT ROLE")}</span>
            <strong>
              {t("Made for")}
              <br />
              {t("what's next.")}
            </strong>
            <div className="art-progress">
              <span />
            </div>
            <span className="art-card-bottom">
              {t("Always a work in progress")} <ArrowUpRight size={15} />
            </span>
          </div>
          <div className="floating-label label-bottom">
            <Sparkles size={15} />
            {t("Skills with a direction")}
          </div>
        </div>
      </section>
      <section className="stats-grid" aria-label={t("Workspace statistics")}>
        {[
          {
            label: t("Roles to explore"),
            value: jobs.length.toString().padStart(2, "0"),
            note: t("Sample opportunities"),
            icon: BriefcaseBusiness,
            color: "mint",
          },
          {
            label: t("Skills in your toolkit"),
            value: state.knownSkills.length.toString().padStart(2, "0"),
            note: t("Self-reported · ready to validate"),
            icon: Layers3,
            color: "lilac",
          },
          {
            label: t("Saved possibilities"),
            value: state.savedJobs.length.toString().padStart(2, "0"),
            note: t("A shortlist worth exploring"),
            icon: Bookmark,
            color: "peach",
          },
          {
            label: t("Learning milestones"),
            value: state.completedCourses.length.toString().padStart(2, "0"),
            note: t("Progress, one step at a time"),
            icon: GraduationCap,
            color: "yellow",
          },
        ].map((stat) => (
          <article className="stat-card" key={stat.label}>
            <div className="stat-top">
              <span>{stat.label}</span>
              <span className={`stat-icon ${stat.color}`}>
                <stat.icon size={17} />
              </span>
            </div>
            <strong className="stat-number">{stat.value}</strong>
            <p>{stat.note}</p>
          </article>
        ))}
      </section>
      <section className="section-block">
        <SectionHeading
          title={t("A few possibilities for you")}
          subtitle={t("A starting point based on the skills in your profile.")}
          href="/jobs/"
          link={t("Explore all roles")}
        />
        <div className="job-grid">
          {recommended.map((job) => (
            <JobCard key={job.id} job={job} compact onOpen={setSelected} />
          ))}
        </div>
      </section>
      <div className="dashboard-bottom">
        <section className="panel growth-panel">
          <SectionHeading title={t("Your growth snapshot")} href="/skills/" link="View profile" />
          <div className="growth-content">
            <div className="growth-ring">
              <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle cx="60" cy="60" r="49" />
                <circle
                  className="ring-value"
                  cx="60"
                  cy="60"
                  r="49"
                  strokeDasharray={`${(state.knownSkills.length / 9) * 308} 308`}
                />
              </svg>
              <div>
                <strong>
                  {state.knownSkills.length}
                  <span>/9</span>
                </strong>
                <small>{t("skills explored")}</small>
              </div>
            </div>
            <div className="growth-copy">
              <span className="mini-label">{t("ROOM TO GROW")}</span>
              <h3>{gaps.length ? t(skillLabels[gaps[0]]) : t("Add evidence to your skills")}</h3>
              <p>
                {gaps.length
                  ? t("A useful next step toward {role} roles.", { role: target.title })
                  : t("Try a short scenario to make your skills more tangible.")}
              </p>
              <Link href="/assessments/" className="text-link">
                {t("Take a skill check")}
                <ArrowRight size={15} />
              </Link>
            </div>
          </div>
          <div className="panel-note">
            <ShieldCheck size={15} />
            {t("Self-reported skills are a starting point, not a certification.")}
          </div>
        </section>
        <section className="panel next-step-panel">
          <div className="next-step-top">
            <span className="course-icon">
              <BookOpen size={22} />
            </span>
            <span className="mini-label">{t("YOUR NEXT SMALL STEP")}</span>
            <span className="pill">{t("CURATED LEARNING")}</span>
          </div>
          <h3>{nextCourse.title}</h3>
          <p>{nextCourse.summary}</p>
          <div className="next-step-bottom">
            <span className="provider-dot">
              d<span>DeepLearning.AI</span>
            </span>
            <Link
              href="/learning/"
              className="round-button"
              aria-label={t("Explore your learning path")}
            >
              <ArrowUpRight size={20} />
            </Link>
          </div>
        </section>
      </div>
      {selected && <JobDetails job={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

export function JobsScreen() {
  const { state } = useWorkspace();
  const { t, fmt } = useI18n();
  const [query, setQuery] = useState("");
  const [track, setTrack] = useState("All tracks");
  const [mode, setMode] = useState("Any workplace");
  const [specialization, setSpecialization] = useState<CareerPathId | "all">("all");
  const [savedOnly, setSavedOnly] = useState(false);
  const [selected, setSelected] = useState<Job | null>(null);
  const candidates = searchJobs(jobs, query, track, mode, state.knownSkills).filter(
    (job) => !savedOnly || state.savedJobs.includes(job.id),
  );
  const results = searchJobs(jobs, query, track, mode, state.knownSkills, specialization).filter(
    (job) => !savedOnly || state.savedJobs.includes(job.id),
  );
  const counts = Object.fromEntries(
    careerPaths.map((path) => [
      path.id,
      candidates.filter((job) => job.specialization === path.id).length,
    ]),
  ) as Record<CareerPathId, number>;
  return (
    <>
      <PageHeading
        eyebrow={t("POSSIBILITY LOOKS GOOD ON YOU")}
        title={t("Find your kind of next.")}
        description={t(
          "Explore AI roles at the intersection of what you know and where you want to go.",
        )}
      />
      <div className="notice inline">
        <Sparkles size={17} />
        <span>
          <strong>{t("Explore the demo.")}</strong>{" "}
          {t(
            "All employers, openings and salaries are fictional. Your saved roles stay in this browser.",
          )}
        </span>
      </div>
      <div className="search-panel">
        <div className="search-input">
          <Search size={19} />
          <input
            aria-label={t("Search jobs")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Role, company, or a skill you're curious about")}
          />
          {query && (
            <button
              aria-label={t("Clear search")}
              className="icon-button"
              onClick={() => setQuery("")}
            >
              <X size={16} />
            </button>
          )}
        </div>
        <div className="filter-row">
          <label>
            <Filter size={15} />
            <select
              aria-label={t("Career track")}
              value={track}
              onChange={(e) => setTrack(e.target.value)}
            >
              <option value="All tracks">{t("All tracks")}</option>
              {tracks.map((track) => (
                <option key={track} value={track}>
                  {t(track)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <MapPin size={15} />
            <select
              aria-label={t("Workplace")}
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              {workplaceOptions.map((m) => (
                <option key={m} value={m}>
                  {t(m)}
                </option>
              ))}
            </select>
          </label>
          <button
            className={`filter-button ${savedOnly ? "selected" : ""}`}
            aria-pressed={savedOnly}
            onClick={() => setSavedOnly(!savedOnly)}
          >
            <Bookmark size={15} />
            {t("Saved only")}
          </button>
          <button
            className="text-link reset-filters"
            onClick={() => {
              setQuery("");
              setTrack("All tracks");
              setMode("Any workplace");
              setSavedOnly(false);
              setSpecialization("all");
            }}
          >
            <RotateCcw size={13} />
            {t("Reset")}
          </button>
        </div>
      </div>
      <CareerPathBrowser selected={specialization} counts={counts} onSelect={setSpecialization} />
      <div className="results-heading">
        <span>
          <strong>{results.length}</strong> {t("possibilities to explore")}
        </span>
        <span>
          <SlidersHorizontal size={14} />
          {t("Sorted by skill overlap")}
        </span>
      </div>
      <div className="job-grid results-grid">
        {results.map((job) => (
          <JobCard key={job.id} job={job} onOpen={setSelected} />
        ))}
      </div>
      {!results.length && (
        <div className="empty-state">
          <Search size={30} />
          <h2>{t("No roles in this corner yet.")}</h2>
          <p>
            {specialization !== "all"
              ? t(
                  "No sample roles match this specialization and your current filters. Its career guide stays available above; try All specializations or reset your filters.",
                )
              : t("Try another keyword, workplace, or career track.")}
          </p>
        </div>
      )}
      {selected && <JobDetails job={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

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

export function AssessmentsScreen() {
  const { state, update } = useWorkspace();
  const { t } = useI18n();
  const [track, setTrack] = useState<Track>(state.track);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const items = questions.filter((q) => q.track === track);
  const result = gradeAssessment(items, answers);
  const answered = items.filter((q) => answers[q.id] !== undefined).length;
  function submit() {
    const now = new Date().toISOString();
    const evidence = result.results.map((r) => ({
      skill: r.question.skill,
      source: "scenario" as const,
      level: r.correct ? 1 : 0,
      updatedAt: now,
    }));
    update((s) => ({
      ...s,
      evidence: [
        ...s.evidence.filter(
          (e) => !evidence.some((n) => n.skill === e.skill && n.source === e.source),
        ),
        ...evidence,
      ],
    }));
    setSubmitted(true);
  }
  return (
    <>
      <PageHeading
        eyebrow={t("CURIOSITY OVER PERFECTION")}
        title={t("Find your starting point.")}
        description={t(
          "A few real-world scenarios to see what feels familiar—and what to explore next.",
        )}
      />
      <div className="assessment-layout">
        <section>
          <div className="assessment-toolbar">
            <label className="field-label">
              {t("Your career direction")}
              <select
                className="text-input"
                value={track}
                onChange={(e) => {
                  setTrack(e.target.value as Track);
                  setAnswers({});
                  setSubmitted(false);
                }}
              >
                {tracks.map((option) => (
                  <option key={option} value={option}>
                    {t(option)}
                  </option>
                ))}
              </select>
            </label>
            <span className="pill">
              <Clock3 size={13} />
              {t("About 3 minutes")}
            </span>
          </div>
          {items.map((q, i) => (
            <article className="panel question-card" key={q.id}>
              <span className="mini-label">
                {t("SCENARIO {n} OF {total}", { n: i + 1, total: items.length })} ·{" "}
                {t(skillLabels[q.skill]).toUpperCase()}
              </span>
              <h2>{q.prompt}</h2>
              <fieldset disabled={submitted}>
                <legend className="sr-only">{q.prompt}</legend>
                {q.options.map((option, j) => (
                  <label
                    className={`answer-option ${answers[q.id] === j ? "chosen" : ""} ${submitted && j === q.correct ? "correct" : ""}`}
                    key={option}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      checked={answers[q.id] === j}
                      onChange={() => setAnswers((a) => ({ ...a, [q.id]: j }))}
                    />
                    <span>{option}</span>
                    {submitted && j === q.correct && <CheckCircle2 size={17} />}
                  </label>
                ))}
              </fieldset>
              {submitted && (
                <div className="answer-explanation">
                  <strong>
                    {answers[q.id] === q.correct
                      ? t("A solid starting point.")
                      : t("An opportunity to learn.")}
                  </strong>
                  <p>{q.explanation}</p>
                </div>
              )}
            </article>
          ))}
          <div className="button-row">
            {!submitted ? (
              <button
                className="button primary"
                disabled={answered !== items.length}
                onClick={submit}
              >
                {t("See my starting point")}
                <ArrowRight size={16} />
              </button>
            ) : (
              <>
                <button
                  className="button secondary"
                  onClick={() => {
                    setSubmitted(false);
                    setAnswers({});
                  }}
                >
                  <RotateCcw size={16} />
                  {t("Try again")}
                </button>
                <Link href="/learning/" className="button primary">
                  {t("Explore my learning path")}
                  <ArrowRight size={16} />
                </Link>
              </>
            )}
          </div>
        </section>
        <aside className="assessment-aside panel">
          <span className="large-icon">
            <Sparkles size={28} />
          </span>
          <h2>
            {submitted
              ? t("{correct} of {total} scenarios", {
                  correct: result.correct,
                  total: result.total,
                })
              : t("A check-in, not a verdict.")}
          </h2>
          <p>
            {submitted
              ? t(
                  "Your scenario evidence is now in your skill profile. One short check is a signal, not proof of independent ability.",
                )
              : t(
                  "This open-book preview explores how you think through a situation. It is not a certification or a hiring test.",
                )}
          </p>
          <div className="progress-track">
            <span style={{ width: `${(answered / items.length) * 100}%` }} />
          </div>
          <small>{t("{answered} of {total} answered", { answered, total: items.length })}</small>
          <hr />
          <h3>{t("What happens next?")}</h3>
          <ul className="plain-list">
            <li>
              <Check size={15} />
              {t("See the reasoning behind each answer")}
            </li>
            <li>
              <Check size={15} />
              {t("Add scenario evidence to your profile")}
            </li>
            <li>
              <Check size={15} />
              {t("Choose a practical learning step")}
            </li>
          </ul>
        </aside>
      </div>
    </>
  );
}

export function LearningScreen() {
  const { state, update } = useWorkspace();
  const { t } = useI18n();
  const skillNames = useSkillNames();
  const [targetId, setTargetId] = useState(jobs[0].id);
  const [showAll, setShowAll] = useState(false);
  const target = jobs.find((j) => j.id === targetId)!;
  const gaps = matchJob(target, state.knownSkills).missing;
  const recommended = recommendCourses(courses, gaps, state.knownSkills);
  const display = showAll
    ? courses.map((course) => ({
        course,
        addresses: course.skills.filter((s) => gaps.includes(s)),
        prerequisitesMissing: course.prerequisites.filter((s) => !state.knownSkills.includes(s)),
      }))
    : recommended;
  return (
    <>
      <PageHeading
        eyebrow={t("LEARN WITH A LITTLE MORE DIRECTION")}
        title={t("Less wandering. More becoming.")}
        description={t(
          "Connect a role you want with the skills and practice that can help you get there.",
        )}
      />
      <section className="learning-hero">
        <div>
          <span className="hero-kicker">{t("A PATH, NOT AN ENDLESS PLAYLIST")}</span>
          <h2>
            {t("Start with the role.")}
            <br />
            {t("Work back to your next step.")}
          </h2>
          <p>
            {t("Curated DeepLearning.AI resources, paired with something you can actually build.")}
          </p>
        </div>
        <GraduationCap size={104} strokeWidth={1.1} />
      </section>
      <div className="learning-controls">
        <label className="field-label">
          {t("I'm exploring")}
          <select
            className="text-input"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          >
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
        </label>
        <div className="segmented">
          <button className={!showAll ? "selected" : ""} onClick={() => setShowAll(false)}>
            {t("For my skill gaps")}
          </button>
          <button className={showAll ? "selected" : ""} onClick={() => setShowAll(true)}>
            {t("All resources")}
          </button>
        </div>
      </div>
      <div className="gap-strip">
        <span className="mini-label">{t("YOUR NEXT FOCUS")}</span>
        {gaps.length ? (
          gaps.map((s) => <SkillTag key={s} skill={s} />)
        ) : (
          <span>{t("No missing self-reported skills. Add evidence through practice.")}</span>
        )}
      </div>
      <div className="course-grid">
        {display.map(({ course, addresses, prerequisitesMissing }, i) => {
          const done = state.completedCourses.includes(course.id);
          return (
            <article className="course-card" key={course.id}>
              <div className="course-card-top">
                <span className="course-number">{String(i + 1).padStart(2, "0")}</span>
                <span className="pill">{t(course.level)}</span>
                <span className="course-format">{t(course.format)}</span>
              </div>
              <span className="provider-dot">
                d<span>{course.provider}</span>
              </span>
              <h2>{course.title}</h2>
              <p>{course.summary}</p>
              <div className="tags">
                {course.skills.map((s) => (
                  <SkillTag key={s} skill={s} />
                ))}
              </div>
              <div className="course-reason">
                <Sparkles size={14} />
                <span>
                  {addresses.length
                    ? t("Why this: builds {skills}.", {
                        skills: skillNames(addresses),
                      })
                    : t("A foundation resource to explore.")}
                  {prerequisitesMissing.length > 0 &&
                    " " +
                      t("Start with {skills}.", {
                        skills: skillNames(prerequisitesMissing),
                      })}
                </span>
              </div>
              <div className="exercise">
                <strong>
                  <Code2 size={15} />
                  {t("MAKE IT TANGIBLE")}
                </strong>
                <p>{course.exercise}</p>
              </div>
              <div className="course-actions">
                <a className="text-link" href={course.url} target="_blank" rel="noreferrer">
                  {t("View official course")}
                  <ExternalLink size={14} />
                </a>
                <button
                  className={`completion-button ${done ? "done" : ""}`}
                  aria-pressed={done}
                  onClick={() =>
                    update((s) => ({
                      ...s,
                      completedCourses: done
                        ? s.completedCourses.filter((id) => id !== course.id)
                        : [...s.completedCourses, course.id],
                    }))
                  }
                >
                  {done ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                  {done ? t("Completed") : t("Mark complete")}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {!display.length && (
        <div className="empty-state">
          <CheckCircle2 size={30} />
          <h2>{t("No course gaps from your self-report.")}</h2>
          <p>{t("Explore all resources or validate your skills with a scenario check.")}</p>
          <button className="button secondary" onClick={() => setShowAll(true)}>
            {t("Browse all resources")}
          </button>
        </div>
      )}
      <div className="notice inline section-block">
        <ShieldCheck size={19} />
        <span>
          {t(
            "Independent editorial recommendations. Not affiliated with DeepLearning.AI. Availability and pricing are set by the provider. Completion is self-reported and does not verify ability.",
          )}
        </span>
      </div>
    </>
  );
}

export function ResumeScreen() {
  const { state, update } = useWorkspace();
  const { t, fmt } = useI18n();
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
                  {j.title}
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

export function ApplicationsScreen() {
  const { state, update } = useWorkspace();
  const { t } = useI18n();
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
                const job = jobs.find((j) => j.id === entry.jobId);
                if (!job) return null;
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
                  {j.title} · {j.company}
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
        <div className="table-scroll">
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
        </div>
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
