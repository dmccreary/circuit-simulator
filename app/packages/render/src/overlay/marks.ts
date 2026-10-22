// Small overlay marks shared by probe flags, tool previews and the circuit-law
// tools (rendering.md §2.2, layer 5). All coordinates are screen CSS px.

import type { Point } from "@cs/model";
import type { Theme } from "../theme";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const inRect = (r: Rect, p: Point, pad = 0): boolean =>
  p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;

/** Filled arrow from `from` to `to` with a head at `to`. */
export function drawArrow(g: CanvasRenderingContext2D, from: Point, to: Point, color: string, width = 2, head = 7): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const ux = dx / len;
  const uy = dy / len;
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = width;
  g.beginPath();
  g.moveTo(from.x, from.y);
  g.lineTo(to.x - ux * head * 0.8, to.y - uy * head * 0.8);
  g.stroke();
  g.beginPath();
  g.moveTo(to.x, to.y);
  g.lineTo(to.x - ux * head - uy * head * 0.55, to.y - uy * head + ux * head * 0.55);
  g.lineTo(to.x - ux * head + uy * head * 0.55, to.y - uy * head - ux * head * 0.55);
  g.closePath();
  g.fill();
}

/** A rounded pill with text, its left-middle at `at` (or centered). Returns its box. */
export function drawTag(
  g: CanvasRenderingContext2D,
  at: Point,
  text: string,
  fill: string,
  theme: Theme,
  opts: { center?: boolean; textColor?: string; bold?: boolean; size?: number } = {},
): Rect {
  const size = opts.size ?? 12;
  g.font = `${opts.bold === false ? "" : "600 "}${size}px ${theme.font}`;
  const w = g.measureText(text).width + 10;
  const h = size + 6;
  const x = opts.center ? at.x - w / 2 : at.x;
  const y = at.y - h / 2;
  g.fillStyle = fill;
  roundRect(g, x, y, w, h, 4);
  g.fill();
  g.fillStyle = opts.textColor ?? "#fff";
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillText(text, x + 5, at.y + 0.5);
  return { x, y, w, h };
}

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.arcTo(x + w, y, x + w, y + r, r);
  g.lineTo(x + w, y + h - r);
  g.arcTo(x + w, y + h, x + w - r, y + h, r);
  g.lineTo(x + r, y + h);
  g.arcTo(x, y + h, x, y + h - r, r);
  g.lineTo(x, y + r);
  g.arcTo(x, y, x + r, y, r);
  g.closePath();
}

/** Clamp ring around a wire or lead: nothing is inserted into the circuit (PRB-08). */
export function drawClamp(g: CanvasRenderingContext2D, at: Point, color: string, r = 7): void {
  g.strokeStyle = color;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(at.x, at.y, r, 0.35, Math.PI * 2 - 0.35);
  g.stroke();
}

/** A lead tip: a filled dot with a contrasting rim (red and black differential leads). */
export function drawLeadTip(g: CanvasRenderingContext2D, at: Point, color: string, rim = "#fff", r = 4): void {
  g.fillStyle = color;
  g.strokeStyle = rim;
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(at.x, at.y, r, 0, Math.PI * 2);
  g.fill();
  g.stroke();
}
