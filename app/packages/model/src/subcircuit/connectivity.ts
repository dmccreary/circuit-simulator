// Connectivity of one sheet (a document's top level or a definition) from its
// geometry alone: wire runs, mid-wire attachments, net labels and named-net
// parts, following the same rules as the compiler's collect stage.

import type { PartResolver } from "../netlist";
import { pointKey } from "../netlist";
import type { NetLabel, Part, Point, Wire } from "../types";
import { UnionFind } from "../compile/nodes";

export interface SheetItems {
  parts: Part[];
  wires: Wire[];
  netLabels: NetLabel[];
  /** Points that connect elsewhere (an enclosing definition's pins). */
  extraAnchors?: Point[];
}

export const netKey = (name: string): string => `net:${name}`;

/** Union every connection among the given items into `uf`. Returns the anchor points used. */
export function unionSheet(uf: UnionFind, items: SheetItems, resolver: PartResolver): void {
  const anchors: Point[] = [...(items.extraAnchors ?? [])];
  for (const part of items.parts) {
    const pts = terminalsOf(part, resolver);
    pts.forEach((p) => {
      uf.find(pointKey(p));
      anchors.push(p);
    });
    const name = resolver.traits(part.type).netName;
    if (name && pts.length) uf.union(pointKey(pts[0]), netKey(name));
  }
  for (const l of items.netLabels) {
    anchors.push(l.at);
    uf.union(pointKey(l.at), netKey(l.name));
  }
  const wires = items.wires.filter((w) => w.points.length >= 2);
  for (const w of wires) anchors.push(w.points[0], w.points[w.points.length - 1]);
  for (const w of wires) {
    for (let i = 0; i + 1 < w.points.length; i++) {
      const a = w.points[i];
      const b = w.points[i + 1];
      uf.union(pointKey(a), pointKey(b));
      for (const p of anchors) if (strictlyInside(p, a, b)) uf.union(pointKey(a), pointKey(p));
    }
  }
}

export function terminalsOf(part: Part, resolver: PartResolver): Point[] {
  try {
    return resolver.terminals(part);
  } catch {
    return [];
  }
}

/** p lies on the axis-aligned segment a-b, not at either end. */
export function strictlyInside(p: Point, a: Point, b: Point): boolean {
  if (a.y === b.y && p.y === a.y) return p.x > Math.min(a.x, b.x) && p.x < Math.max(a.x, b.x);
  if (a.x === b.x && p.x === a.x) return p.y > Math.min(a.y, b.y) && p.y < Math.max(a.y, b.y);
  return false;
}

/** p lies on the segment a-b, ends included. */
export function onSegment(p: Point, a: Point, b: Point): boolean {
  return (p.x === a.x && p.y === a.y) || (p.x === b.x && p.y === b.y) || strictlyInside(p, a, b);
}

/** Grid points of an axis-aligned segment, ends included. */
export function segmentPoints(a: Point, b: Point): Point[] {
  const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  const out: Point[] = [];
  for (let k = 0; k <= n; k++) out.push({ x: a.x + Math.sign(b.x - a.x) * k, y: a.y + Math.sign(b.y - a.y) * k });
  return out;
}
