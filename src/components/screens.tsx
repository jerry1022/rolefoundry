"use client";
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

function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {action}
    </div>
  );
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
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {href && (
        <Link className="text-link" href={href}>
          {link || "View all"}
          <ArrowRight size={16} />
        </Link>
      )}
    </div>
  );
}
function SkillTag({ skill, known }: { skill: Skill; known?: boolean }) {
  return (
    <span className={`skill-tag ${known ? "known" : ""}`}>
      {known && <Check size={11} />}
      {skillLabels[skill]}
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
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={ref} className="modal" onCancel={onClose} aria-label={title}>
      <button className="icon-button modal-close" aria-label="Close details" onClick={onClose}>
        <X size={20} />
      </button>
      {children}
    </dialog>
  );
}
function JobDetails({ job, onClose }: { job: Job; onClose: () => void }) {
  const { state, update } = useWorkspace();
  const match = matchJob(job, state.knownSkills);
  const tracked = state.applications.some((a) => a.jobId === job.id);
  return (
    <Modal title={job.title} onClose={onClose}>
      <div className={`company-logo ${job.color}`}>{job.initials}</div>
      <p className="eyebrow modal-eyebrow">{job.company} · ILLUSTRATIVE OPENING</p>
      <h2 className="modal-title">{job.title}</h2>
      <p className="muted">
        {job.location} · {job.mode} · {job.level}
      </p>
      <p className="detail-summary">{job.summary}</p>
      <h3>What you would work on</h3>
      <ul className="detail-list">
        {job.responsibilities.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <h3>Your starting point</h3>
      <div className="tags">
        {job.skills.map((s) => (
          <SkillTag key={s} skill={s} known={state.knownSkills.includes(s)} />
        ))}
      </div>
      <div className="notice">
        <strong>{match.coverage}% skill overlap</strong>
        <p>
          Based on your self-reported skills, not hiring probability.{" "}
          {match.missing.length
            ? `Explore ${match.missing.map((s) => skillLabels[s]).join(" and ")} next.`
            : "Add scenario evidence to strengthen your profile."}
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
          {tracked ? "In your tracker" : "Add to tracker"}
        </button>
        <Link href="/learning/" className="button secondary" onClick={onClose}>
          Find learning resources
          <ArrowUpRight size={16} />
        </Link>
      </div>
      <p className="fine-print">
        This company, opening and salary are sample data. No application is sent. Live job sources
        are part of the production roadmap.
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
  const saved = state.savedJobs.includes(job.id);
  const match = matchJob(job, state.knownSkills);
  return (
    <article className={`job-card ${compact ? "compact" : ""}`}>
      <div className="job-card-top">
        <div className={`company-logo ${job.color}`}>{job.initials}</div>
        <span className="job-company">
          {job.company}
          <small>{job.added}</small>
        </span>
        <button
          className={`icon-button bookmark ${saved ? "saved" : ""}`}
          aria-label={`${saved ? "Unsave" : "Save"} ${job.title}`}
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
      <p className="job-location">
        <MapPin size={13} />
        {job.location}
        <span>·</span>
        {job.mode}
      </p>
      {!compact && <p className="job-summary">{job.summary}</p>}
      <div className="tags">
        {job.skills.slice(0, 3).map((skill) => (
          <SkillTag skill={skill} key={skill} known={state.knownSkills.includes(skill)} />
        ))}
      </div>
      <div className="job-card-bottom">
        <span>{compact ? job.level : job.salary}</span>
        <button className="match-label" onClick={() => onOpen(job)}>
          <span className="status-dot" />
          {match.coverage}% overlap
          <ArrowUpRight size={13} />
        </button>
      </div>
    </article>
  );
}

export function Dashboard() {
  const { state } = useWorkspace();
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
        eyebrow="YOUR CAREER, IN THE MAKING"
        title={`Good things ahead, ${state.name}.`}
        description="Find your direction. Build the skills. Make your next move."
        action={
          <Link href="/jobs/" className="button secondary">
            Explore opportunities
            <ArrowUpRight size={16} />
          </Link>
        }
      />
      <section className="hero-panel">
        <div className="hero-content">
          <span className="hero-kicker">
            <span /> FROM POTENTIAL TO POSSIBILITY
          </span>
          <h2>
            Your next chapter
            <br />
            starts with a little clarity.
          </h2>
          <p>
            Discover AI roles that fit you, see where you can grow,
            <br className="desktop-br" /> and turn your curiosity into a concrete next step.
          </p>
          <Link href="/assessments/" className="button dark">
            Find my starting point
            <ArrowUpRight size={17} />
          </Link>
          <span className="hero-footnote">A 3-question preview. No perfect answers required.</span>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="art-spark spark-one">✳</div>
          <div className="art-spark spark-two">✦</div>
          <div className="floating-label label-top">
            <CheckCircle2 size={15} />A little more confidence
          </div>
          <div className="art-card">
            <span className="art-card-icon">
              <Sprout size={34} />
            </span>
            <span className="art-card-line">YOUR NEXT ROLE</span>
            <strong>
              Made for
              <br />
              what&apos;s next.
            </strong>
            <div className="art-progress">
              <span />
            </div>
            <span className="art-card-bottom">
              Always a work in progress <ArrowUpRight size={15} />
            </span>
          </div>
          <div className="floating-label label-bottom">
            <Sparkles size={15} />
            Skills with a direction
          </div>
        </div>
      </section>
      <section className="stats-grid" aria-label="Workspace statistics">
        {[
          {
            label: "Roles to explore",
            value: jobs.length.toString().padStart(2, "0"),
            note: "Sample opportunities",
            icon: BriefcaseBusiness,
            color: "mint",
          },
          {
            label: "Skills in your toolkit",
            value: state.knownSkills.length.toString().padStart(2, "0"),
            note: "Self-reported · ready to validate",
            icon: Layers3,
            color: "lilac",
          },
          {
            label: "Saved possibilities",
            value: state.savedJobs.length.toString().padStart(2, "0"),
            note: "A shortlist worth exploring",
            icon: Bookmark,
            color: "peach",
          },
          {
            label: "Learning milestones",
            value: state.completedCourses.length.toString().padStart(2, "0"),
            note: "Progress, one step at a time",
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
          title="A few possibilities for you"
          subtitle="A starting point based on the skills in your profile."
          href="/jobs/"
          link="Explore all roles"
        />
        <div className="job-grid">
          {recommended.map((job) => (
            <JobCard key={job.id} job={job} compact onOpen={setSelected} />
          ))}
        </div>
      </section>
      <div className="dashboard-bottom">
        <section className="panel growth-panel">
          <SectionHeading title="Your growth snapshot" href="/skills/" link="View profile" />
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
                <small>skills explored</small>
              </div>
            </div>
            <div className="growth-copy">
              <span className="mini-label">ROOM TO GROW</span>
              <h3>{gaps.length ? skillLabels[gaps[0]] : "Add evidence to your skills"}</h3>
              <p>
                {gaps.length
                  ? `A useful next step toward ${target.title.toLowerCase()} roles.`
                  : "Try a short scenario to make your skills more tangible."}
              </p>
              <Link href="/assessments/" className="text-link">
                Take a skill check
                <ArrowRight size={15} />
              </Link>
            </div>
          </div>
          <div className="panel-note">
            <ShieldCheck size={15} />
            Self-reported skills are a starting point, not a certification.
          </div>
        </section>
        <section className="panel next-step-panel">
          <div className="next-step-top">
            <span className="course-icon">
              <BookOpen size={22} />
            </span>
            <span className="mini-label">YOUR NEXT SMALL STEP</span>
            <span className="pill">CURATED LEARNING</span>
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
              aria-label="Explore your learning path"
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
  const [query, setQuery] = useState("");
  const [track, setTrack] = useState("All tracks");
  const [mode, setMode] = useState("Any workplace");
  const [savedOnly, setSavedOnly] = useState(false);
  const [selected, setSelected] = useState<Job | null>(null);
  const results = searchJobs(jobs, query, track, mode, state.knownSkills).filter(
    (job) => !savedOnly || state.savedJobs.includes(job.id),
  );
  return (
    <>
      <PageHeading
        eyebrow="POSSIBILITY LOOKS GOOD ON YOU"
        title="Find your kind of next."
        description="Explore AI roles at the intersection of what you know and where you want to go."
      />
      <div className="notice inline">
        <Sparkles size={17} />
        <span>
          <strong>Explore the demo.</strong> All employers, openings and salaries are fictional.
          Your saved roles stay in this browser.
        </span>
      </div>
      <div className="search-panel">
        <div className="search-input">
          <Search size={19} />
          <input
            aria-label="Search jobs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Role, company, or a skill you're curious about"
          />
          {query && (
            <button aria-label="Clear search" className="icon-button" onClick={() => setQuery("")}>
              <X size={16} />
            </button>
          )}
        </div>
        <div className="filter-row">
          <label>
            <Filter size={15} />
            <select
              aria-label="Career track"
              value={track}
              onChange={(e) => setTrack(e.target.value)}
            >
              <option>All tracks</option>
              {tracks.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            <MapPin size={15} />
            <select aria-label="Workplace" value={mode} onChange={(e) => setMode(e.target.value)}>
              {["Any workplace", "Remote", "Hybrid", "On-site"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <button
            className={`filter-button ${savedOnly ? "selected" : ""}`}
            aria-pressed={savedOnly}
            onClick={() => setSavedOnly(!savedOnly)}
          >
            <Bookmark size={15} />
            Saved only
          </button>
          <button
            className="text-link reset-filters"
            onClick={() => {
              setQuery("");
              setTrack("All tracks");
              setMode("Any workplace");
              setSavedOnly(false);
            }}
          >
            <RotateCcw size={13} />
            Reset
          </button>
        </div>
      </div>
      <div className="results-heading">
        <span>
          <strong>{results.length}</strong> possibilities to explore
        </span>
        <span>
          <SlidersHorizontal size={14} />
          Sorted by skill overlap
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
          <h2>No roles in this corner yet.</h2>
          <p>Try another keyword, workplace, or career track.</p>
        </div>
      )}
      {selected && <JobDetails job={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

export function SkillsScreen() {
  const { state, update } = useWorkspace();
  return (
    <>
      <PageHeading
        eyebrow="MORE THAN A LIST OF TOOLS"
        title="Make your skills tangible."
        description="Start with what you know. Add evidence as you learn, build and practice."
        action={
          <Link href="/assessments/" className="button primary">
            Take a skill check
            <ArrowUpRight size={16} />
          </Link>
        }
      />
      <div className="profile-grid">
        <section className="panel">
          <SectionHeading
            title="Your starting point"
            subtitle="Edit the demo profile. Changes are saved in this browser."
          />
          <label className="field-label">
            First name
            <input
              className="text-input"
              value={state.name}
              maxLength={100}
              onChange={(e) => update((s) => ({ ...s, name: e.target.value }))}
            />
          </label>
          <label className="field-label">
            Career direction
            <select
              className="text-input"
              value={state.track}
              onChange={(e) => update((s) => ({ ...s, track: e.target.value as Track }))}
            >
              {tracks.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <div className="notice">
            <ShieldCheck size={20} />
            <p>
              Your profile is local to this browser. Use sample information; do not enter sensitive
              personal data.
            </p>
          </div>
        </section>
        <section className="panel">
          <SectionHeading
            title="Your skill toolkit"
            subtitle="Select skills you have experience with. This is self-report, not verification."
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
                <span>{skillLabels[skill]}</span>
                <small>Self-reported</small>
              </label>
            ))}
          </div>
        </section>
      </div>
      <section className="panel section-block">
        <SectionHeading
          title="Evidence, not just confidence"
          subtitle="Scenario results are separate from self-reported experience."
        />
        {state.evidence.length ? (
          <div className="evidence-list">
            {state.evidence.map((e) => (
              <div key={`${e.skill}-${e.source}`} className="evidence-item">
                <span className="stat-icon mint">
                  <Target size={18} />
                </span>
                <div>
                  <strong>{skillLabels[e.skill]}</strong>
                  <p>
                    {e.level > 0 ? "Correct in a short scenario" : "Worth revisiting"} ·{" "}
                    {new Date(e.updatedAt).toLocaleDateString("en-US")}
                  </p>
                </div>
                <span className="pill">Scenario evidence</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state compact-empty">
            <Target size={28} />
            <h3>Your next proof point starts small.</h3>
            <p>Complete a short scenario check to add evidence here.</p>
            <Link className="text-link" href="/assessments/">
              Try a skill check
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
        eyebrow="CURIOSITY OVER PERFECTION"
        title="Find your starting point."
        description="A few real-world scenarios to see what feels familiar—and what to explore next."
      />
      <div className="assessment-layout">
        <section>
          <div className="assessment-toolbar">
            <label className="field-label">
              Your career direction
              <select
                className="text-input"
                value={track}
                onChange={(e) => {
                  setTrack(e.target.value as Track);
                  setAnswers({});
                  setSubmitted(false);
                }}
              >
                {tracks.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <span className="pill">
              <Clock3 size={13} />
              About 3 minutes
            </span>
          </div>
          {items.map((q, i) => (
            <article className="panel question-card" key={q.id}>
              <span className="mini-label">
                SCENARIO {i + 1} OF {items.length} · {skillLabels[q.skill].toUpperCase()}
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
                      ? "A solid starting point."
                      : "An opportunity to learn."}
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
                See my starting point
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
                  Try again
                </button>
                <Link href="/learning/" className="button primary">
                  Explore my learning path
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
              ? `${result.correct} of ${result.total} scenarios`
              : "A check-in, not a verdict."}
          </h2>
          <p>
            {submitted
              ? "Your scenario evidence is now in your skill profile. One short check is a signal, not proof of independent ability."
              : "This open-book preview explores how you think through a situation. It is not a certification or a hiring test."}
          </p>
          <div className="progress-track">
            <span style={{ width: `${(answered / items.length) * 100}%` }} />
          </div>
          <small>
            {answered} of {items.length} answered
          </small>
          <hr />
          <h3>What happens next?</h3>
          <ul className="plain-list">
            <li>
              <Check size={15} />
              See the reasoning behind each answer
            </li>
            <li>
              <Check size={15} />
              Add scenario evidence to your profile
            </li>
            <li>
              <Check size={15} />
              Choose a practical learning step
            </li>
          </ul>
        </aside>
      </div>
    </>
  );
}

export function LearningScreen() {
  const { state, update } = useWorkspace();
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
        eyebrow="LEARN WITH A LITTLE MORE DIRECTION"
        title="Less wandering. More becoming."
        description="Connect a role you want with the skills and practice that can help you get there."
      />
      <section className="learning-hero">
        <div>
          <span className="hero-kicker">A PATH, NOT AN ENDLESS PLAYLIST</span>
          <h2>
            Start with the role.
            <br />
            Work back to your next step.
          </h2>
          <p>Curated DeepLearning.AI resources, paired with something you can actually build.</p>
        </div>
        <GraduationCap size={104} strokeWidth={1.1} />
      </section>
      <div className="learning-controls">
        <label className="field-label">
          I&apos;m exploring
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
            For my skill gaps
          </button>
          <button className={showAll ? "selected" : ""} onClick={() => setShowAll(true)}>
            All resources
          </button>
        </div>
      </div>
      <div className="gap-strip">
        <span className="mini-label">YOUR NEXT FOCUS</span>
        {gaps.length ? (
          gaps.map((s) => <SkillTag key={s} skill={s} />)
        ) : (
          <span>No missing self-reported skills. Add evidence through practice.</span>
        )}
      </div>
      <div className="course-grid">
        {display.map(({ course, addresses, prerequisitesMissing }, i) => {
          const done = state.completedCourses.includes(course.id);
          return (
            <article className="course-card" key={course.id}>
              <div className="course-card-top">
                <span className="course-number">{String(i + 1).padStart(2, "0")}</span>
                <span className="pill">{course.level}</span>
                <span className="course-format">{course.format}</span>
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
                    ? `Why this: builds ${addresses.map((s) => skillLabels[s]).join(" and ")}.`
                    : "A foundation resource to explore."}
                  {prerequisitesMissing.length > 0 &&
                    ` Start with ${prerequisitesMissing.map((s) => skillLabels[s]).join(", ")}.`}
                </span>
              </div>
              <div className="exercise">
                <strong>
                  <Code2 size={15} />
                  MAKE IT TANGIBLE
                </strong>
                <p>{course.exercise}</p>
              </div>
              <div className="course-actions">
                <a className="text-link" href={course.url} target="_blank" rel="noreferrer">
                  View official course
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
                  {done ? "Completed" : "Mark complete"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {!display.length && (
        <div className="empty-state">
          <CheckCircle2 size={30} />
          <h2>No course gaps from your self-report.</h2>
          <p>Explore all resources or validate your skills with a scenario check.</p>
          <button className="button secondary" onClick={() => setShowAll(true)}>
            Browse all resources
          </button>
        </div>
      )}
      <div className="notice inline section-block">
        <ShieldCheck size={19} />
        <span>
          Independent editorial recommendations. Not affiliated with DeepLearning.AI. Availability
          and pricing are set by the provider. Completion is self-reported and does not verify
          ability.
        </span>
      </div>
    </>
  );
}

export function ResumeScreen() {
  const { state, update } = useWorkspace();
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
        eyebrow="YOUR EXPERIENCE, BETTER EXPRESSED"
        title="Give your story some shape."
        description="Connect real experience to the role you want. Keep the facts yours."
        action={
          <button className="button secondary" onClick={download}>
            <ArrowDownToLine size={16} />
            Export text
          </button>
        }
      />
      <div className="notice inline">
        <FileText size={18} />
        <span>
          Local text workspace. AI rewriting, file parsing and PDF export are designed, but not
          connected in this scaffold.
        </span>
      </div>
      <div className="resume-layout">
        <section className="panel resume-editor">
          <SectionHeading
            title="Your working draft"
            subtitle="Use sample information. Edits are stored in this browser."
          />
          <label className="sr-only" htmlFor="resume-draft">
            Resume draft
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
            <span>{state.resume.length.toLocaleString()} / 30,000 characters</span>
            <span>
              <span className="status-dot" />
              Saved locally
            </span>
          </div>
        </section>
        <aside className="panel resume-review">
          <span className="large-icon">
            <Sparkles size={25} />
          </span>
          <h2>A clearer connection.</h2>
          <p>
            Review your draft alongside a sample role. These are deterministic prompts, not
            AI-generated claims.
          </p>
          <label className="field-label">
            Target role
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
            Review my draft
            <ArrowRight size={16} />
          </button>
          {review && (
            <div className="review-results" role="status">
              <h3>Your review checklist</h3>
              {target.skills.map((s) => (
                <div className="review-item" key={s}>
                  <Target size={16} />
                  <p>
                    <strong>{skillLabels[s]}</strong>
                    <br />
                    {state.resume.toLowerCase().includes(s)
                      ? "Mentioned in your draft. Add a concrete example and your contribution."
                      : "Not clearly evidenced. Add a real example if you have one; otherwise leave it as a learning goal."}
                  </p>
                </div>
              ))}
              <div className="notice">
                <p>
                  Use: problem → your action → observed result → evidence. Add numbers only when you
                  measured them.
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
            {copied ? "Copied to clipboard" : "Copy draft"}
          </button>
          {copyError && (
            <p role="status" className="fine-print">
              Clipboard access unavailable. Select the draft text or use Export text.
            </p>
          )}
        </aside>
      </div>
    </>
  );
}

export function ApplicationsScreen() {
  const { state, update } = useWorkspace();
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
        eyebrow="ONE PLACE FOR YOUR NEXT MOVES"
        title="Keep your possibilities moving."
        description="A simple, manual tracker. Visiting a job link never counts as an application."
        action={
          <button className="button primary" onClick={() => setAdding(true)}>
            <Plus size={16} />
            Track a role
          </button>
        }
      />
      <div className="pipeline-summary">
        <div>
          <strong>{state.applications.length.toString().padStart(2, "0")}</strong>
          <span>roles in your pipeline</span>
        </div>
        <p>
          Small follow-ups make a difference.
          <br />
          Add a note about your next step.
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
                {stage}
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
                        aria-label={`Remove ${job.title} from tracker`}
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
                      Stage for {job.title}
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
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    <label className="sr-only" htmlFor={`note-${job.id}`}>
                      Note for {job.title}
                    </label>
                    <textarea
                      id={`note-${job.id}`}
                      placeholder="Next step or a note…"
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
                    <span className="fine-print">Sample role · manual status</span>
                  </article>
                );
              })}
              {!entries.length && <div className="kanban-empty">Room for your next move.</div>}
            </section>
          );
        })}
      </div>
      {adding && (
        <Modal title="Track a sample role" onClose={() => setAdding(false)}>
          <span className="large-icon">
            <BriefcaseBusiness size={25} />
          </span>
          <h2>Keep a possibility in view.</h2>
          <p className="muted">
            Add a sample role to your local tracker. This does not send an application.
          </p>
          <label className="field-label">
            Sample role
            <select className="text-input" value={jobId} onChange={(e) => setJobId(e.target.value)}>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title} · {j.company}
                </option>
              ))}
            </select>
          </label>
          <button className="button primary" onClick={add}>
            Add to tracker
            <Plus size={16} />
          </button>
        </Modal>
      )}
    </>
  );
}

export function AdminScreen() {
  const { reset } = useWorkspace();
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <PageHeading
        eyebrow="BEHIND THE POSSIBILITIES"
        title="A thoughtful foundation."
        description="Inspect the sample catalog and the boundaries of this scaffold."
      />
      <div className="notice inline">
        <ShieldCheck size={19} />
        <span>
          This is a public, read-only demo inspector—not an authenticated admin service. Production
          access requires server-side authorization.
        </span>
      </div>
      <div className="stats-grid admin-stats">
        {[
          { name: "Sample roles", count: jobs.length },
          { name: "Official course links", count: courses.length },
          { name: "Scenario questions", count: questions.length },
          { name: "Career tracks", count: tracks.length },
        ].map((s) => (
          <div className="stat-card" key={s.name}>
            <span className="mini-label">{s.name}</span>
            <strong className="stat-number">{s.count}</strong>
          </div>
        ))}
      </div>
      <section className="panel">
        <SectionHeading
          title="Catalog provenance"
          subtitle="A source trail should be part of the product, not an afterthought."
        />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Dataset</th>
                <th>Source</th>
                <th>Current state</th>
                <th>Production requirement</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Job openings</td>
                <td>Authored fictional fixtures</td>
                <td>
                  <span className="pill">Demo only</span>
                </td>
                <td>Authorized feeds, review and expiry</td>
              </tr>
              <tr>
                <td>Course catalog</td>
                <td>DeepLearning.AI official links</td>
                <td>
                  <span className="pill">Editorial mapping</span>
                </td>
                <td>Review links, prerequisites and availability</td>
              </tr>
              <tr>
                <td>Assessments</td>
                <td>Authored scenarios and fixed answers</td>
                <td>
                  <span className="pill">Preview rubric</span>
                </td>
                <td>Expert review and calibration</td>
              </tr>
              <tr>
                <td>Personal data</td>
                <td>Local demo browser state</td>
                <td>
                  <span className="pill">No backend</span>
                </td>
                <td>Auth, consent, RLS and deletion</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel section-block">
        <SectionHeading title="Integration roadmap" />
        <div className="roadmap-grid">
          {[
            {
              icon: Database,
              title: "Durable workspace",
              text: "Supabase Auth, PostgreSQL and private Storage. Tenant-scoped access and deletion.",
            },
            {
              icon: Network,
              title: "Background processing",
              text: "pgmq queues, a Node worker, idempotent tasks and provider adapters.",
            },
            {
              icon: Sparkles,
              title: "Evidence-based analysis",
              text: "Schema-validated extraction and review, with versions, quotas and human confirmation.",
            },
          ].map((item) => (
            <div key={item.title} className="roadmap-item">
              <item.icon size={23} />
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="reset-panel">
        <div>
          <h3>Start with a clean workspace</h3>
          <p>Remove local edits, saved roles, scenario results and tracker entries.</p>
        </div>
        <button className="button secondary" onClick={() => setConfirm(true)}>
          <RotateCcw size={15} />
          Reset demo
        </button>
      </section>
      {confirm && (
        <Modal title="Reset your local demo" onClose={() => setConfirm(false)}>
          <h2>Start fresh?</h2>
          <p>
            This removes your local demo changes and restores the sample profile. It does not affect
            any external account.
          </p>
          <div className="button-row">
            <button className="button secondary" onClick={() => setConfirm(false)}>
              Keep my changes
            </button>
            <button
              className="button primary"
              onClick={() => {
                reset();
                setConfirm(false);
              }}
            >
              Reset local demo
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function ArchitectureScreen() {
  return (
    <>
      <PageHeading
        eyebrow="OPEN BY DESIGN"
        title="One connected career system."
        description="A modular foundation built around shared skills, traceable evidence and clear service boundaries."
        action={
          <a
            href="https://github.com/jerry1022/rolefoundry/tree/main/docs"
            className="button secondary"
            target="_blank"
            rel="noreferrer"
          >
            Read the design docs
            <ArrowUpRight size={16} />
          </a>
        }
      />
      <div className="architecture-map">
        <div className="arch-tier">
          <span className="mini-label">EXPERIENCE</span>
          <div className="arch-node primary-node">
            <PanelsIcon />
            <strong>Next.js web application</strong>
            <span>Public catalog · personal workspace · admin</span>
          </div>
        </div>
        <div className="arch-connector">
          ↓<small>Typed service interfaces</small>
        </div>
        <div className="arch-tier">
          <span className="mini-label">DOMAIN MODULES</span>
          <div className="arch-modules">
            {[
              "Identity & access",
              "Profile & evidence",
              "Job catalog",
              "Skill dictionary",
              "Assessment",
              "Matching & gaps",
              "Courses & learning",
              "Resume studio",
              "Application tracker",
            ].map((t) => (
              <div key={t}>{t}</div>
            ))}
          </div>
        </div>
        <div className="arch-connector">
          ↓<small>Repositories & task contracts</small>
        </div>
        <div className="arch-storage">
          <div className="arch-node">
            <Database size={24} />
            <strong>PostgreSQL + pgvector</strong>
            <span>Records · evidence · retrieval</span>
          </div>
          <div className="arch-node">
            <FileText size={24} />
            <strong>Private Storage</strong>
            <span>Resumes · exports</span>
          </div>
          <div className="arch-node">
            <Network size={24} />
            <strong>Queue + Node worker</strong>
            <span>Imports · parsing · analysis</span>
          </div>
        </div>
        <div className="arch-connector">
          ↓<small>Server-side provider boundary</small>
        </div>
        <div className="arch-node provider-node">
          <Sparkles size={22} />
          <strong>AI Gateway</strong>
          <span>Structured output · versions · quotas · no live provider in demo</span>
        </div>
      </div>
      <div className="profile-grid section-block">
        <section className="panel">
          <h2>What runs today</h2>
          <ul className="detail-list">
            <li>Next.js routes and a responsive application shell.</li>
            <li>Fixture-backed search, overlap matching and course ranking.</li>
            <li>Scenario scoring and local evidence records.</li>
            <li>Local resume editing, text export and an application board.</li>
            <li>Typed repository, provider and worker contracts.</li>
          </ul>
        </section>
        <section className="panel">
          <h2>What comes next</h2>
          <ul className="detail-list">
            <li>Authentication, RLS and database migrations.</li>
            <li>Authorized catalogs and source lifecycle management.</li>
            <li>Persistent queues and isolated document processing.</li>
            <li>Model adapters, output validation and explicit consent.</li>
            <li>Production telemetry, backups and deployment controls.</li>
          </ul>
        </section>
      </div>
    </>
  );
}
function PanelsIcon() {
  return <Layers3 size={24} />;
}
