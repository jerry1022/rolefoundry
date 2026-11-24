"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Compass,
  FileText,
  Github,
  GraduationCap,
  LayoutDashboard,
  Menu,
  Network,
  PanelsTopLeft,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sprout,
  Target,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace";
import { LocaleProvider, msg, useI18n } from "@/lib/i18n";
import { LocaleSwitcher } from "./ui/locale-switcher";
import { ThemeSwitcher } from "./ui/theme-switcher";

const navigation = [
  { href: "/", label: msg("Overview"), icon: LayoutDashboard },
  { href: "/jobs/", label: msg("Discover roles"), icon: Compass },
  { href: "/skills/", label: msg("My skill profile"), icon: Target },
  { href: "/assessments/", label: msg("Skill check"), icon: Sparkles },
  { href: "/matches/", label: msg("Matching & gaps"), icon: Network },
  { href: "/learning/", label: msg("Learning path"), icon: GraduationCap },
  { href: "/resume/", label: msg("Resume studio"), icon: FileText },
  { href: "/applications/", label: msg("Applications"), icon: BriefcaseBusiness },
  { href: "/dictionary/", label: msg("Skill dictionary"), icon: Network },
  { href: "/account/", label: msg("Account & privacy"), icon: ShieldCheck },
];
function ShellContent({ children }: { children: ReactNode }) {
  const path = usePathname();
  const connected = process.env.NEXT_PUBLIC_IDENTITY_ENABLED === "true";
  const { state, ready, storageWarning } = useWorkspace();
  const [menu, setMenu] = useState(false);
  const { t } = useI18n();
  const active = (href: string) =>
    href === "/" ? path === "/" : path.startsWith(href.replace(/\/$/, ""));
  const current = t(
    navigation.find((n) => active(n.href))?.label ||
      (path.startsWith("/admin") ? msg("Catalog studio") : msg("System architecture")),
  );
  return (
    <div className="app-shell">
      {menu && (
        <button
          className="mobile-scrim"
          onClick={() => setMenu(false)}
          aria-label={t("Close navigation")}
        />
      )}
      <aside className={`sidebar ${menu ? "is-open" : ""}`}>
        <Link href="/" className="brand" onClick={() => setMenu(false)}>
          <span className="brand-mark">
            <Sprout size={23} strokeWidth={2.1} />
          </span>
          <span>
            rolefoundry<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="workspace-tag">
          <span className="status-dot" /> {t("YOUR NEXT CHAPTER")}
        </div>
        <p className="nav-label">{t("WORKSPACE")}</p>
        <nav aria-label={t("Main navigation")}>
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenu(false)}
              className={`nav-item ${active(item.href) ? "active" : ""}`}
              aria-current={active(item.href) ? "page" : undefined}
            >
              <item.icon size={19} />
              <span>{t(item.label)}</span>
              {item.href === "/learning/" && <span className="nav-count">6</span>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="tiny-star">✳</span>
            <h3>
              {t("Built for your")}
              <br />
              {t("next possibility.")}
            </h3>
            <p>
              {t("Small steps. Real skills.")}
              <br />
              {t("A career that fits.")}
            </p>
            <Link href="/learning/" onClick={() => setMenu(false)}>
              {t("Find your next step")} <ArrowUpRight size={15} />
            </Link>
          </div>
          <Link
            className={`nav-item ${active("/architecture/") ? "active" : ""}`}
            href="/architecture/"
            onClick={() => setMenu(false)}
          >
            <Network size={18} />
            {t("Architecture")}
          </Link>
          <Link
            className={`nav-item ${active("/admin/") ? "active" : ""}`}
            href="/admin/"
            onClick={() => setMenu(false)}
          >
            <Settings2 size={18} />
            {t("Catalog studio")}
          </Link>
          <a
            className="nav-item"
            href="https://github.com/jerry1022/rolefoundry"
            target="_blank"
            rel="noreferrer"
          >
            <Github size={18} />
            {t("Open source")} <ArrowUpRight size={14} />
          </a>
          <div className="sidebar-profile">
            <span className="avatar">{connected ? "R" : state.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>
                {connected ? t("Career workspace") : t("{name}’s workspace", { name: state.name })}
              </strong>
              <small>{connected ? t("Account & privacy") : t("Local demo account")}</small>
            </div>
            <span className="profile-dots">···</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label={t("Open navigation")}
              onClick={() => setMenu(true)}
            >
              {menu ? <X size={20} /> : <Menu size={20} />}
            </button>
            <PanelsTopLeft size={17} />
            <span>{t("Workspace")}</span>
            <span className="slash">/</span>
            <strong>{current}</strong>
          </div>
          <div className="topbar-right">
            <ThemeSwitcher />
            <LocaleSwitcher />
            <span className="demo-pill">
              <span className="status-dot" />
              {connected ? t("Connected workspace") : t("Interactive demo")}
            </span>
            <a
              href="https://github.com/jerry1022/rolefoundry"
              target="_blank"
              rel="noreferrer"
              className="github-link"
            >
              <Github size={17} />
              <span>{t("Star on GitHub")}</span>
              <ArrowUpRight size={14} />
            </a>
          </div>
        </header>
        <main id="main-content" aria-busy={!ready}>
          {storageWarning && (
            <div className="notice warning" role="status">
              {t(
                "Browser storage is unavailable or was reset. Your current changes may only last for this session.",
              )}
            </div>
          )}
          <fieldset className="workspace-controls" disabled={!ready}>
            <legend className="sr-only">{t("Career workspace")}</legend>
            {children}
          </fieldset>
        </main>
        <footer className="footer">
          <span>
            <Sprout size={14} /> RoleFoundry · {t("A little more direction.")}
          </span>
          <span>{t("Sample roles. Real learning possibilities.")}</span>
        </footer>
      </div>
    </div>
  );
}
export function Shell({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider>
      <WorkspaceProvider>
        <SkipLink />
        <ShellContent>{children}</ShellContent>
      </WorkspaceProvider>
    </LocaleProvider>
  );
}
function SkipLink() {
  const { t } = useI18n();
  return (
    <a className="skip-link" href="#main-content">
      {t("Skip to content")}
    </a>
  );
}
