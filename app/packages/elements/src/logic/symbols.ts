// Drawing helpers shared by the logic part views (local frame, grid units).

import type { MessageRef, Part } from "@cs/model";
import type { SymbolGraphics } from "../api";
import { circle, line, polyline } from "../shared/viewKit";

const quad = (p0: [number, number], c: [number, number], p1: [number, number], n = 10): [number, number][] => {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
  }
  return out;
};

/** Inversion bubble whose left edge is at x; returns its right edge. */
export function bubble(g: SymbolGraphics, x: number, y: number): number {
  circle(g, x + 0.2, y, 0.2);
  return x + 0.4;
}

/** Two-input gate body between y = 0 and y = 2, output at (4, 1). */
export function drawGate(g: SymbolGraphics, shape: "and" | "or" | "xor", inverted: boolean): void {
  let tip: number;
  let backX: number;
  if (shape === "and") {
    polyline(g, [
      [2, 2.5],
      [1, 2.5],
      [1, -0.5],
      [2, -0.5],
    ]);
    g.arc(2, 1, 1.5, -Math.PI / 2, Math.PI / 2);
    g.closePath();
    g.stroke("symbol");
    tip = 3.5;
    backX = 1;
  } else {
    const upper = quad([1, -0.5], [2.8, -0.5], [3.5, 1]);
    const lower = quad([3.5, 1], [2.8, 2.5], [1, 2.5]);
    polyline(g, [...upper, ...lower.slice(1)]);
    const a = Math.atan2(1.5, 2);
    g.arc(-1, 1, 2.5, a, -a, true);
    g.closePath();
    g.stroke("symbol");
    if (shape === "xor") {
      g.beginPath();
      g.arc(-1.35, 1, 2.5, a, -a, true);
      g.stroke("symbol");
    }
    tip = 3.5;
    backX = -1 + Math.sqrt(2.5 * 2.5 - 1) - (shape === "xor" ? 0.35 : 0);
  }
  if (inverted) tip = bubble(g, tip, 1);
  line(g, tip, 1, 4, 1);
  line(g, 0, 0, backX, 0);
  line(g, 0, 2, backX, 2);
}

/** Box with pin labels for flip-flops. */
export function drawBox(g: SymbolGraphics, x0: number, y0: number, x1: number, y1: number): void {
  polyline(g, [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ], true);
  g.stroke("symbol");
}

/** Clock-input wedge on the left edge of a box at height y. */
export function clockWedge(g: SymbolGraphics, x: number, y: number): void {
  polyline(g, [
    [x, y - 0.3],
    [x + 0.35, y],
    [x, y + 0.3],
  ]);
  g.stroke("symbol");
}

export function pinLabel(g: SymbolGraphics, s: string, x: number, y: number, align: "left" | "right" | "center" = "left"): void {
  g.text(s, x, y, { size: 0.5, align, baseline: "middle", color: "label" });
}

export function describeLogic(part: Part): MessageRef {
  return { key: `element.${part.type}.describe`, values: { label: part.label } };
}

/** Whether a terminal voltage reads high for the part's own threshold. */
export function readsHigh(part: Part, v: number): boolean {
  const supply = typeof part.props.supply === "number" ? part.props.supply : 5;
  const vth = part.props.family === "ttl" ? 1.4 : supply / 2;
  return v >= vth;
}
