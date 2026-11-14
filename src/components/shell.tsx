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

const navigation = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/jobs/", label: "Discover roles", icon: Compass },
  { href: "/skills/", label: "My skill profile", icon: Target },
  { href: "/assessments/", label: "Skill check", icon: Sparkles },
  { href: "/learning/", label: "Learning path", icon: GraduationCap },
  { href: "/resume/", label: "Resume studio", icon: FileText },
  { href: "/applications/", label: "Applications", icon: BriefcaseBusiness },
  { href: "/dictionary/", label: "Skill dictionary", icon: Network },
  { href: "/account/", label: "Account & privacy", icon: ShieldCheck },
];
function ShellContent({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { state, ready, storageWarning } = useWorkspace();
  const [menu, setMenu] = useState(false);
  const active = (href: string) =>
    href === "/" ? path === "/" : path.startsWith(href.replace(/\/$/, ""));
  const current =
    navigation.find((n) => active(n.href))?.label ||
    (path.startsWith("/admin") ? "Catalog studio" : "System architecture");
  return (
    <div className="app-shell">
      {menu && (
        <button
          className="mobile-scrim"
          onClick={() => setMenu(false)}
          aria-label="Close navigation"
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
          <span className="status-dot" /> YOUR NEXT CHAPTER
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenu(false)}
              className={`nav-item ${active(item.href) ? "active" : ""}`}
              aria-current={active(item.href) ? "page" : undefined}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.href === "/learning/" && <span className="nav-count">6</span>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="tiny-star">✳</span>
            <h3>
              Built for your
              <br />
              next possibility.
            </h3>
            <p>
              Small steps. Real skills.
              <br />A career that fits.
            </p>
            <Link href="/learning/" onClick={() => setMenu(false)}>
              Find your next step <ArrowUpRight size={15} />
            </Link>
          </div>
          <Link
            className={`nav-item ${active("/architecture/") ? "active" : ""}`}
            href="/architecture/"
            onClick={() => setMenu(false)}
          >
            <Network size={18} />
            Architecture
          </Link>
          <Link
            className={`nav-item ${active("/admin/") ? "active" : ""}`}
            href="/admin/"
            onClick={() => setMenu(false)}
          >
            <Settings2 size={18} />
            Catalog studio
          </Link>
          <a
            className="nav-item"
            href="https://github.com/jerry1022/rolefoundry"
            target="_blank"
            rel="noreferrer"
          >
            <Github size={18} />
            Open source <ArrowUpRight size={14} />
          </a>
          <div className="sidebar-profile">
            <span className="avatar">{state.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{state.name}&apos;s workspace</strong>
              <small>Local demo account</small>
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
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              {menu ? <X size={20} /> : <Menu size={20} />}
            </button>
            <PanelsTopLeft size={17} />
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>{current}</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-pill">
              <span className="status-dot" />
              Interactive demo
            </span>
            <a
              href="https://github.com/jerry1022/rolefoundry"
              target="_blank"
              rel="noreferrer"
              className="github-link"
            >
              <Github size={17} />
              <span>Star on GitHub</span>
              <ArrowUpRight size={14} />
            </a>
          </div>
        </header>
        <main id="main-content" aria-busy={!ready}>
          {storageWarning && (
            <div className="notice warning" role="status">
              Browser storage is unavailable or was reset. Your current changes may only last for
              this session.
            </div>
          )}
          <fieldset className="workspace-controls" disabled={!ready}>
            <legend className="sr-only">Career workspace</legend>
            {children}
          </fieldset>
        </main>
        <footer className="footer">
          <span>
            <Sprout size={14} /> RoleFoundry · A little more direction.
          </span>
          <span>Sample roles. Real learning possibilities.</span>
        </footer>
      </div>
    </div>
  );
}
export function Shell({ children }: { children: ReactNode }) {
  return (
    <WorkspaceProvider>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <ShellContent>{children}</ShellContent>
    </WorkspaceProvider>
  );
}
