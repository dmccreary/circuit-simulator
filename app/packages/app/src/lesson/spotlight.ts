// Spotlights (LES-09): a pulsing outline around parts on the schematic overlay,
// and a highlight class on controls named by command id or palette part type.

import { findPart } from "@cs/lesson";
import { getView } from "@cs/elements/views";
import { partBox, type OverlayDrawer } from "@cs/render";
import type { AppController } from "../controller";
import { elementAccess } from "../controller";

export const SPOTLIGHT_CLASS = "lesson-spotlight";

/** Split refs into part labels and control selectors. */
export function splitSpotlight(refs: readonly string[]): { parts: string[]; selectors: string[] } {
  const parts: string[] = [];
  const selectors: string[] = [];
  for (const r of refs) {
    const m = /^(command|palette):(.+)$/.exec(r);
    if (!m) parts.push(r);
    else if (/^[\w.:-]+$/.test(m[2])) selectors.push(m[1] === "command" ? `[data-command="${m[2]}"]` : `[data-part-type="${m[2]}"]`);
  }
  return { parts, selectors };
}

/** Draws the spotlight for the given part labels; reads them on every frame so it follows the circuit. */
export function spotlightDrawer(c: AppController, labels: () => readonly string[], now: () => number = () => performance.now()): OverlayDrawer {
  return (ctx, view) => {
    const list = labels();
    if (!list.length) return;
    const pulse = 0.5 + 0.5 * Math.sin(now() / 250);
    ctx.lineWidth = 2 + pulse * 2;
    ctx.strokeStyle = `rgba(245, 158, 11, ${0.55 + 0.45 * pulse})`;
    ctx.fillStyle = "rgba(245, 158, 11, 0.95)";
    for (const ref of list) {
      const part = findPart(c.edits.doc, ref);
      if (!part) continue;
      const b = partBox(part, getView(part.type), elementAccess);
      const a = view.toScreen({ x: b.x, y: b.y });
      const w = b.w * view.scale;
      const h = b.h * view.scale;
      const pad = 8;
      ctx.beginPath();
      ctx.roundRect(a.x - pad, a.y - pad, w + 2 * pad, h + 2 * pad, 6);
      ctx.stroke();
      // Arrow callout pointing down at the part.
      const tipX = a.x + w / 2;
      const tipY = a.y - pad - 2;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - 7, tipY - 12);
      ctx.lineTo(tipX + 7, tipY - 12);
      ctx.closePath();
      ctx.fill();
    }
    // Keep pulsing.
    c.scheduler.invalidate("overlay");
  };
}

/** Apply the highlight class to controls; returns a function that removes it. */
export function highlightControls(root: ParentNode, selectors: readonly string[]): () => void {
  if (!selectors.length) return () => {};
  const els = [...root.querySelectorAll<HTMLElement>(selectors.join(","))];
  els.forEach((e) => e.classList.add(SPOTLIGHT_CLASS));
  return () => els.forEach((e) => e.classList.remove(SPOTLIGHT_CLASS));
}
