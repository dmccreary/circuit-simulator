// Probe flags (PRB-09): a small flag in the trace color on a thin leader to
// the measured point, with the probe's name and optionally its live value.
// Current probes add a clamp ring and a direction arrow (PRB-06, PRB-08);
// differential probes show red and black lead tips.

import type { Point } from "@cs/model";
import type { Theme } from "../theme";
import { drawArrow, drawClamp, drawLeadTip, drawTag, type Rect } from "./marks";

export interface FlagSpec {
  id: string;
  name: string;
  color: string;
  /** Screen point the leader runs to. */
  anchor: Point;
  /** Screen point of the flag's left-middle. */
  at: Point;
  /** Formatted live value; absent hides it (setting off, or a blind lesson step). */
  value?: string;
  selected?: boolean;
  /** Current probes: the positive direction, drawn at the anchor. */
  arrow?: { from: Point; to: Point };
  clamp?: boolean;
  /** Differential voltage probes: the black lead's point (the red one is the anchor). */
  black?: Point;
}

export interface FlagHit {
  id: string;
  box: Rect;
  /** The direction arrow's box, for click-to-reverse (PRB-06). */
  arrow?: Rect;
}

const RED = "#d32f2f";
const BLACK = "#202020";

export function drawProbeFlags(g: CanvasRenderingContext2D, flags: readonly FlagSpec[], theme: Theme): FlagHit[] {
  const hits: FlagHit[] = [];
  for (const f of flags) {
    g.save();
    g.strokeStyle = f.color;
    g.lineWidth = 1.2;
    g.setLineDash([3, 2]);
    g.beginPath();
    g.moveTo(f.anchor.x, f.anchor.y);
    g.lineTo(f.at.x, f.at.y);
    if (f.black) {
      g.moveTo(f.at.x, f.at.y);
      g.lineTo(f.black.x, f.black.y);
    }
    g.stroke();
    g.setLineDash([]);
    if (f.black) {
      drawLeadTip(g, f.anchor, RED);
      drawLeadTip(g, f.black, BLACK);
    } else if (f.clamp) {
      drawClamp(g, f.anchor, f.color);
    } else {
      g.fillStyle = f.color;
      g.beginPath();
      g.arc(f.anchor.x, f.anchor.y, 3, 0, Math.PI * 2);
      g.fill();
    }
    let arrowBox: Rect | undefined;
    if (f.arrow) {
      drawArrow(g, f.arrow.from, f.arrow.to, f.color, 2.5, 8);
      const xs = [f.arrow.from.x, f.arrow.to.x];
      const ys = [f.arrow.from.y, f.arrow.to.y];
      arrowBox = { x: Math.min(...xs) - 6, y: Math.min(...ys) - 6, w: Math.abs(xs[1] - xs[0]) + 12, h: Math.abs(ys[1] - ys[0]) + 12 };
    }
    const text = f.value !== undefined ? `${f.name}  ${f.value}` : f.name;
    const box = drawTag(g, f.at, text, f.color, theme);
    if (f.selected) {
      g.strokeStyle = theme.selection;
      g.lineWidth = 2;
      g.strokeRect(box.x - 2, box.y - 2, box.w + 4, box.h + 4);
    }
    g.restore();
    hits.push({ id: f.id, box, arrow: arrowBox });
  }
  return hits;
}
