// An optional extension of SymbolGraphics for the lifelike view (CAN-14) and
// for failure marks: raw CSS colors for the things a theme token cannot name
// (resistor color bands, a red LED's lens, scorch marks). The canvas and SVG
// implementations in @cs/render provide it; any other SymbolGraphics (tests,
// shifted wrappers) falls back to the nearest theme token, so every view still
// draws everywhere.
//
// Proposed for the api.ts contract: `strokeCss` and `fillCss` on SymbolGraphics.

import type { ColorToken, SymbolGraphics } from "../api";

export interface RichGraphics extends SymbolGraphics {
  readonly rich: true;
  strokeCss(color: string, width?: number): void;
  fillCss(color: string, alpha?: number): void;
}

export function isRich(g: SymbolGraphics): g is RichGraphics {
  return (g as Partial<RichGraphics>).rich === true;
}

/** Fill the current path with a CSS color, or with `fallback` on plain graphics. */
export function fillCss(g: SymbolGraphics, css: string, fallback: ColorToken = "symbol", alpha?: number): void {
  if (isRich(g)) g.fillCss(css, alpha);
  else g.fill(fallback, alpha);
}

/** Stroke the current path with a CSS color, or with `fallback` on plain graphics. */
export function strokeCss(g: SymbolGraphics, css: string, width?: number, fallback: ColorToken = "symbol"): void {
  if (isRich(g)) g.strokeCss(css, width);
  else g.stroke(fallback, width);
}

/** Closed rectangle path (call fill/stroke after). */
export function rectPath(g: SymbolGraphics, x: number, y: number, w: number, h: number): void {
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + w, y);
  g.lineTo(x + w, y + h);
  g.lineTo(x, y + h);
  g.closePath();
}

/** Rectangle with rounded ends of radius r (a resistor body, a battery can). */
export function roundRectPath(g: SymbolGraphics, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.lineTo(x + w - rr, y);
  g.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0);
  g.lineTo(x + w, y + h - rr);
  g.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2);
  g.lineTo(x + rr, y + h);
  g.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI);
  g.lineTo(x, y + rr);
  g.arc(x + rr, y + rr, rr, Math.PI, (3 * Math.PI) / 2);
  g.closePath();
}

export function circlePath(g: SymbolGraphics, cx: number, cy: number, r: number): void {
  g.beginPath();
  g.arc(cx, cy, r, 0, 2 * Math.PI);
  g.closePath();
}
