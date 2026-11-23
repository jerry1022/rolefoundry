"use client";
import { useState, type ReactNode } from "react";
/** Unmount closed editors so private data and mutation drafts do not remain in hidden panels. */
export function AdminSection({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="panel section-block"
      aria-label={title}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>{title}</summary>
      {open && children}
    </details>
  );
}
