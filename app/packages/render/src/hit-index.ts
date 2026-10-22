import type { Point } from "@cs/model";
import type { Box } from "@cs/elements";

export type HitTarget =
  | { kind: "terminal"; part: string; terminal: number; at: Point }
  | { kind: "control"; part: string; control: string; box: Box }
  | { kind: "part"; part: string; box: Box }
  | { kind: "segment"; wire: string; segment: number; from: Point; to: Point };

export interface HitResult {
  target: HitTarget;
  /** Distance from the query point in grid units (0 when inside a box). */
  distance: number;
}

/** Lower number wins when several targets are under the pointer. */
const PRIORITY: Record<HitTarget["kind"], number> = { control: 0, terminal: 1, segment: 2, part: 3 };

export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distToBox(p: Point, b: Box): number {
  const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.w));
  const dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

function boundsOf(t: HitTarget): Box {
  switch (t.kind) {
    case "terminal":
      return { x: t.at.x, y: t.at.y, w: 0, h: 0 };
    case "control":
    case "part":
      return t.box;
    case "segment":
      return {
        x: Math.min(t.from.x, t.to.x),
        y: Math.min(t.from.y, t.to.y),
        w: Math.abs(t.to.x - t.from.x),
        h: Math.abs(t.to.y - t.from.y),
      };
  }
}

/**
 * Uniform grid hash over hit targets (rendering.md §2.4). Coordinates are
 * grid units; rebuilt whenever the document or compiled circuit changes.
 */
export class HitIndex {
  private cells = new Map<string, HitTarget[]>();
  private readonly cell: number;
  private all: HitTarget[] = [];

  constructor(cellSize = 4) {
    this.cell = cellSize;
  }

  get size(): number {
    return this.all.length;
  }

  clear(): void {
    this.cells.clear();
    this.all = [];
  }

  insert(t: HitTarget): void {
    this.all.push(t);
    const b = boundsOf(t);
    const c = this.cell;
    for (let cx = Math.floor(b.x / c); cx <= Math.floor((b.x + b.w) / c); cx++) {
      for (let cy = Math.floor(b.y / c); cy <= Math.floor((b.y + b.h) / c); cy++) {
        const k = `${cx},${cy}`;
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, (list = []));
        list.push(t);
      }
    }
  }

  /** Every target within `tol` grid units of p, best first. */
  query(p: Point, tol: number): HitResult[] {
    const c = this.cell;
    const seen = new Set<HitTarget>();
    const out: HitResult[] = [];
    for (let cx = Math.floor((p.x - tol) / c); cx <= Math.floor((p.x + tol) / c); cx++) {
      for (let cy = Math.floor((p.y - tol) / c); cy <= Math.floor((p.y + tol) / c); cy++) {
        for (const t of this.cells.get(`${cx},${cy}`) ?? []) {
          if (seen.has(t)) continue;
          seen.add(t);
          const d = this.distance(t, p);
          if (d <= tol) out.push({ target: t, distance: d });
        }
      }
    }
    return out.sort((a, b) => PRIORITY[a.target.kind] - PRIORITY[b.target.kind] || a.distance - b.distance);
  }

  /** Every target whose bounds intersect the box (rubber-band selection). */
  inBox(box: Box): HitTarget[] {
    return this.all.filter((t) => {
      const b = boundsOf(t);
      return b.x <= box.x + box.w && b.x + b.w >= box.x && b.y <= box.y + box.h && b.y + b.h >= box.y;
    });
  }

  private distance(t: HitTarget, p: Point): number {
    switch (t.kind) {
      case "terminal":
        return Math.hypot(p.x - t.at.x, p.y - t.at.y);
      case "control":
      case "part":
        return distToBox(p, t.box);
      case "segment":
        return distToSegment(p, t.from, t.to);
    }
  }
}

/**
 * Hit tolerance in grid units. On a coarse pointer the target grows to at
 * least 44 CSS px across (RSP-13).
 */
export function hitTolerance(scalePxPerGrid: number, coarse: boolean): number {
  const px = coarse ? 22 : 6;
  return px / scalePxPerGrid;
}
