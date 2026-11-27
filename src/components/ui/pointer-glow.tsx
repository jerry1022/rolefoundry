"use client";
import { useEffect } from "react";

/** Cards that show a soft spotlight under the pointer; styled in globals.css (`--glow-x/y`). */
export const glowSurfaces =
  ".job-card, .stat-card, .course-card, .application-card, .career-path-card, .learning-card";

/**
 * One passive document listener positions the spotlight on whichever card is under a fine
 * pointer, throttled to animation frames. Nothing runs for touch-only devices or when the
 * viewer prefers reduced motion, and it follows changes to either setting after load.
 */
export function PointerGlow() {
  useEffect(() => {
    const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let latest: PointerEvent | null = null;
    let listening = false;
    const update = () => {
      frame = 0;
      const event = latest;
      if (!event || !(event.target instanceof Element)) return;
      const surface = event.target.closest<HTMLElement>(glowSurfaces);
      if (!surface) return;
      const box = surface.getBoundingClientRect();
      surface.style.setProperty("--glow-x", `${event.clientX - box.left}px`);
      surface.style.setProperty("--glow-y", `${event.clientY - box.top}px`);
    };
    const onMove = (event: PointerEvent) => {
      latest = event;
      if (!frame) frame = requestAnimationFrame(update);
    };
    // Re-evaluate when the viewer attaches a mouse or changes their motion preference.
    const sync = () => {
      const wanted = finePointer.matches && !reduced.matches;
      if (wanted === listening) return;
      listening = wanted;
      if (wanted) document.addEventListener("pointermove", onMove, { passive: true });
      else document.removeEventListener("pointermove", onMove);
    };
    sync();
    finePointer.addEventListener("change", sync);
    reduced.addEventListener("change", sync);
    return () => {
      finePointer.removeEventListener("change", sync);
      reduced.removeEventListener("change", sync);
      document.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
