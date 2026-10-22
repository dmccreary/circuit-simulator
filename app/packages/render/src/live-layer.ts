// Live-layer effects drawn every frame on top of the wires (rendering.md §2.2,
// §4): voltage gradients inside parts (ANI-13), the power view glow (ANI-16)
// and crossing gaps (CAN-10). Called by SchematicRenderer.drawLive.

import type { Part, Point } from "@cs/model";
import type { ElementView } from "@cs/elements";
import type { Affine, CanvasSymbolGraphics, SymbolRecording } from "./canvas-graphics";
import type { Crossing } from "./crossings";
import type { LiveEffects } from "./live-effects";
import { gradientStops, powerColor } from "./live-colors";
import type { Theme } from "./theme";
import type { ViewTransform } from "./transform";

export interface LivePartAccess {
  parts: Iterable<Part>;
  view(type: string): ElementView | undefined;
  /** Terminal positions, document grid. */
  terminals(partId: string): Point[];
  /** Local symbol frame → screen CSS px. */
  matrix(part: Part): Affine;
  /** The part's recorded symbol, when recordings are available. */
  recording(view: ElementView, part: Part): SymbolRecording | undefined;
}

/** Inverse of an affine map (orientation, translation and scale are always invertible). */
export function invertAffine(m: Affine): Affine {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c || 1;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

const apply = (m: Affine, p: Point): Point => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });

/**
 * Repaint each two-terminal part's lines with a gradient from terminal 0's
 * voltage color to terminal 1's (ANI-13). Parts with no visible drop are left
 * as drawn on the symbols layer.
 */
export function drawPartGradients(
  g: CanvasSymbolGraphics,
  live: LiveEffects,
  parts: LivePartAccess,
  view: ViewTransform,
  theme: Theme,
  range: number,
  style: "ansi" | "iec" | "lifelike",
): void {
  const ctx = g.context;
  if (typeof ctx.createLinearGradient !== "function") return;
  for (const part of parts.parts) {
    const ts = parts.terminals(part.id);
    const pv = parts.view(part.type);
    const volts = live.volts(part.id);
    if (!pv || ts.length !== 2 || !volts || volts.length < 2) continue;
    const stops = gradientStops(theme, volts[0], volts[1], range);
    if (!stops) continue;
    const m = parts.matrix(part);
    const inv = invertAffine(m);
    const a = apply(inv, view.toScreen(ts[0]));
    const b = apply(inv, view.toScreen(ts[1]));
    g.setFrame(m);
    const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    if (!grad) continue;
    grad.addColorStop(0, stops[0]);
    grad.addColorStop(1, stops[1]);
    g.tint = grad;
    g.linesOnly = true;
    const rec = parts.recording(pv, part);
    if (rec) g.drawRecording(rec);
    else pv.drawSymbol(g, part, style);
  }
  g.tint = undefined;
  g.linesOnly = false;
}

/** Power view (ANI-16): a warm or cool glow over each part's body, scaled to the largest power. */
export function drawPowerGlow(g: CanvasSymbolGraphics, live: LiveEffects, parts: LivePartAccess): void {
  const ctx = g.context;
  for (const part of parts.parts) {
    const v = live.get(part.id);
    const pv = parts.view(part.type);
    if (!v || !pv) continue;
    const c = powerColor(v.power, live.maxPower);
    if (!c) continue;
    const b = pv.hitShape(part);
    g.setFrame(parts.matrix(part));
    const m = 0.2;
    ctx.beginPath();
    ctx.rect(b.x - m, b.y - m, b.w + 2 * m, b.h + 2 * m);
    g.fillCss(c.color, c.alpha);
  }
}

/** Gaps where wires cross without a junction (CAN-10): the vertical wire is broken, the horizontal drawn through. */
export function drawHops(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  theme: Theme,
  crossings: readonly Crossing[],
  overColor: (c: Crossing) => string,
  lineWidth: number,
): void {
  if (!crossings.length) return;
  const gap = Math.max(3, 0.3 * view.scale);
  for (const c of crossings) {
    const p = view.toScreen(c.at);
    ctx.fillStyle = theme.tokens.background;
    ctx.fillRect(p.x - lineWidth, p.y - gap, 2 * lineWidth, 2 * gap);
    ctx.strokeStyle = overColor(c);
    ctx.beginPath();
    ctx.moveTo(p.x - gap - 1, p.y);
    ctx.lineTo(p.x + gap + 1, p.y);
    ctx.stroke();
  }
}
