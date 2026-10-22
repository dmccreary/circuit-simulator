// Wire crossings without a junction (CAN-10): where a horizontal segment
// passes through the inside of a vertical one and neither ends there, the two
// wires are not connected, and the vertical wire is drawn with a small gap so
// that is obvious.

import type { Point, Wire } from "@cs/model";

export interface Crossing {
  at: Point;
  /** The wire drawn on top (horizontal) and the one drawn broken (vertical). */
  over: { wire: string; segment: number };
  under: { wire: string; segment: number };
}

interface Seg {
  wire: string;
  segment: number;
  a: Point;
  b: Point;
}

/** Strictly inside (lo, hi), with a little tolerance for floating grid values. */
const inside = (v: number, p: number, q: number) => v > Math.min(p, q) + 1e-9 && v < Math.max(p, q) - 1e-9;

export function findWireCrossings(wires: Iterable<Wire>): Crossing[] {
  const hs: Seg[] = [];
  const vs: Seg[] = [];
  for (const w of wires) {
    for (let i = 0; i + 1 < w.points.length; i++) {
      const a = w.points[i];
      const b = w.points[i + 1];
      if (a.y === b.y && a.x !== b.x) hs.push({ wire: w.id, segment: i, a, b });
      else if (a.x === b.x && a.y !== b.y) vs.push({ wire: w.id, segment: i, a, b });
    }
  }
  const out: Crossing[] = [];
  if (!hs.length || !vs.length) return out;
  // Sort verticals by x so each horizontal checks only the ones within its span.
  vs.sort((p, q) => p.a.x - q.a.x);
  for (const h of hs) {
    const x0 = Math.min(h.a.x, h.b.x);
    const x1 = Math.max(h.a.x, h.b.x);
    let lo = 0;
    let hi = vs.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (vs[mid].a.x <= x0) lo = mid + 1;
      else hi = mid;
    }
    for (let k = lo; k < vs.length && vs[k].a.x < x1; k++) {
      const v = vs[k];
      if (!inside(v.a.x, h.a.x, h.b.x) || !inside(h.a.y, v.a.y, v.b.y)) continue;
      out.push({ at: { x: v.a.x, y: h.a.y }, over: { wire: h.wire, segment: h.segment }, under: { wire: v.wire, segment: v.segment } });
    }
  }
  return out;
}
