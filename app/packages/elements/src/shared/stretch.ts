// Helpers for multi-terminal parts whose drawing stretches with part.length
// (ElementDescriptor.stretchable.terminals): the body keeps its size and the
// leads grow, as CircuitJS1 draws parts placed between two arbitrary points.

import type { Part, Point } from "@cs/model";
import type { SymbolGraphics } from "../api";

/** part.length minus the descriptor default: how far the moving terminals have shifted. */
export function stretchOf(part: Part, defaultLength: number): number {
  return (part.length ?? defaultLength) - defaultLength;
}

/** A view of `g` with every coordinate offset by (dx, dy). */
export function shiftX(g: SymbolGraphics, dx: number, dy = 0): SymbolGraphics {
  if (dx === 0 && dy === 0) return g;
  return {
    beginPath: () => g.beginPath(),
    moveTo: (x, y) => g.moveTo(x + dx, y + dy),
    lineTo: (x, y) => g.lineTo(x + dx, y + dy),
    arc: (cx, cy, r, a0, a1, ccw) => g.arc(cx + dx, cy + dy, r, a0, a1, ccw),
    closePath: () => g.closePath(),
    stroke: (c, w) => g.stroke(c, w),
    fill: (c, a) => g.fill(c, a),
    text: (s, x, y, st) => g.text(s, x + dx, y + dy, st),
  };
}

export const shiftPoint = (p: Point, dx: number): Point => ({ x: p.x + dx, y: p.y });
