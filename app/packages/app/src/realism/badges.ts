// Canvas overlay for realism (RLM-05, RLM-06, RLM-08): an amber warning badge
// with a heat bar on parts over their rating, a red badge on failed parts, a
// grey info badge for wildly overloaded parts in ideal mode, and the puff of
// smoke when a part fails.

import type { CircuitDocument } from "@cs/model";
import { failedMode } from "@cs/elements";
import { partBox, type ElementAccess, type LiveEffects, type Theme, type ViewTransform } from "@cs/render";
import { SMOKE_SECONDS, type Smoke } from "./session";

const AMBER = "#f59f00";
const RED = "#d32f2f";
const GREY = "#78838f";

/** Heat bar color: amber when warm, red near the failure point. */
export function heatColor(heat: number): string {
  const h = Math.max(0, Math.min(1, heat));
  const r = Math.round(245 + (211 - 245) * h);
  const g = Math.round(159 + (47 - 159) * h);
  const b = Math.round(0 + (47 - 0) * h);
  return `rgb(${r},${g},${b})`;
}

function badge(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, glyph: string, font: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = `700 11px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, x, y + 0.5);
}

export interface BadgeInputs {
  doc: CircuitDocument;
  access: ElementAccess;
  live: LiveEffects;
  view: ViewTransform;
  theme: Theme;
  smokes: readonly Smoke[];
  now: number;
  reducedMotion: boolean;
  idealHints: boolean;
}

export function drawRealismOverlay(ctx: CanvasRenderingContext2D, o: BadgeInputs): void {
  const { doc, live, view, theme } = o;
  for (const part of Object.values(doc.parts)) {
    const failed = failedMode(part.props);
    const v = live.get(part.id);
    const warm = live.ratingsOn && v && !failed && (v.stress > 1 || v.heat > 0.2);
    const hint = !live.ratingsOn && o.idealHints && v?.worst && v.worst.value > 10 * v.worst.rating;
    if (!failed && !warm && !hint) continue;
    const b = partBox(part, o.access.getView(part.type), o.access);
    const p = view.toScreen({ x: b.x + b.w, y: b.y });
    const x = p.x + 4;
    const y = p.y - 4;
    if (failed) badge(ctx, x, y, RED, "✕", theme.font);
    else if (warm && v) {
      badge(ctx, x, y, AMBER, "!", theme.font);
      // Heat bar filling toward failure.
      const w = 26;
      ctx.fillStyle = theme.tokens.background;
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 1;
      ctx.fillRect(x - w / 2, y + 11, w, 5);
      ctx.fillStyle = heatColor(v.heat);
      ctx.fillRect(x - w / 2, y + 11, w * Math.min(1, v.heat), 5);
      ctx.strokeRect(x - w / 2, y + 11, w, 5);
    } else badge(ctx, x, y, GREY, "i", theme.font);
  }
  if (o.reducedMotion) return; // ACC-13: no smoke animation
  for (const s of o.smokes) {
    const part = doc.parts[s.part];
    if (!part) continue;
    const age = (o.now - s.start) / SMOKE_SECONDS;
    if (age < 0 || age > 1) continue;
    const b = partBox(part, o.access.getView(part.type), o.access);
    const c = view.toScreen({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
    const r0 = Math.max(6, 0.5 * view.scale);
    for (let k = 0; k < 3; k++) {
      const a = Math.max(0, age - k * 0.12);
      ctx.globalAlpha = 0.45 * (1 - a);
      ctx.fillStyle = k === 1 ? "#9e9e9e" : "#757575";
      ctx.beginPath();
      ctx.arc(c.x + (k - 1) * r0 * 0.6, c.y - a * 3 * r0, r0 * (0.6 + 1.2 * a), 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
