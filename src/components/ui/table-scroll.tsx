import type { ReactNode } from "react";

/**
 * Horizontal scroll container for wide tables. It is a labelled, focusable region so keyboard
 * users can scroll it (WCAG 2.1.1; axe `scrollable-region-focusable`).
 */
export function TableScroll({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="table-scroll" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}
