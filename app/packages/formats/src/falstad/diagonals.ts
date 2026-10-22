// Falstad draws two-terminal parts at any angle; ours lie along a grid axis.
// A diagonal part is straightened along one side of its bounding box and a
// wire runs down the other side to its far terminal. The bend (the part's new
// far terminal) must be a free point: not another post, not on the middle of
// a wire (where our compiler would attach it, EDT-11), and not the bend of
// another straightened part. A diamond bridge rectifier has four diagonal
// diodes whose bends compete, so the bends are planned together, parts with
// the fewest free choices first.

import type { Point } from "@cs/model";
import type { FalstadElement } from "./text";

const key = (p: Point) => `${p.x},${p.y}`;

export interface DiagonalPart {
  index: number;
  from: Point;
  toward: Point;
}

/** Grid points strictly inside straight Falstad wires. */
export function wireInteriors(els: FalstadElement[], g: (x: number, y: number) => Point): Set<string> {
  const out = new Set<string>();
  for (const e of els) {
    if (e.code !== "w" || e.route) continue;
    const a = g(e.x1, e.y1);
    const b = g(e.x2, e.y2);
    if (a.x !== b.x && a.y !== b.y) continue;
    const n = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    for (let k = 1; k < n; k++) out.add(key({ x: a.x + (Math.sign(b.x - a.x) * k), y: a.y + Math.sign(b.y - a.y) * k }));
  }
  return out;
}

/** The two possible bends of a straightened part, major axis first. */
export function bends(from: Point, toward: Point): Point[] {
  const horizontal = { x: toward.x, y: from.y };
  const vertical = { x: from.x, y: toward.y };
  return Math.abs(toward.x - from.x) >= Math.abs(toward.y - from.y) ? [horizontal, vertical] : [vertical, horizontal];
}

/** Points strictly between a and b on an axis-aligned segment. */
function between(a: Point, b: Point): Point[] {
  const n = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
  const out: Point[] = [];
  for (let k = 1; k < n; k++) out.push({ x: a.x + Math.sign(b.x - a.x) * k, y: a.y + Math.sign(b.y - a.y) * k });
  return out;
}

/** A straightened placement: the part runs from `from` to `bend`, a wire follows `path` to `toward`. */
export interface Bend {
  bend: Point;
  path: Point[];
}

/** Grid points along a polyline, end points excluded. */
function along(path: Point[]): Point[] {
  const out: Point[] = [];
  for (let i = 1; i < path.length; i++) {
    out.push(...between(path[i - 1], path[i]));
    if (i < path.length - 1) out.push(path[i]);
  }
  return out;
}

/**
 * Placements to try, best first: the two corners of the bounding box (the part
 * along one side, the wire down the other), then a shorter part along either
 * axis in any direction with an L-shaped wire to the far terminal.
 */
function candidates(p: DiagonalPart): Bend[] {
  const { from, toward } = p;
  const out: Bend[] = bends(from, toward).map((b) => ({ bend: b, path: [b, toward] }));
  const reach = Math.max(Math.abs(toward.x - from.x), Math.abs(toward.y - from.y)) + 2;
  const extra: Bend[] = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let k = 2; k <= reach; k++) {
      const b = { x: from.x + dx * k, y: from.y + dy * k };
      if (b.x === toward.x && b.y === toward.y) continue;
      if (b.x === toward.x || b.y === toward.y) extra.push({ bend: b, path: [b, toward] });
      else for (const c of [{ x: toward.x, y: b.y }, { x: b.x, y: toward.y }]) extra.push({ bend: b, path: [b, c, toward] });
    }
  }
  const len = (c: Bend) => along(c.path).length;
  extra.sort((a, b) => len(a) - len(b));
  return out.concat(extra);
}

/** Element index -> chosen placement, for the parts that have a usable one. */
export function planBends(parts: DiagonalPart[], posts: Set<string>, interiors: Set<string>): Map<number, Bend> {
  // Bends and the cells of the wires already planned, which later choices must avoid too.
  const taken = new Set<string>();
  const wired = new Set<string>();
  const usable = (p: DiagonalPart, c: Bend) => {
    const k = key(c.bend);
    if (posts.has(k) || interiors.has(k) || taken.has(k) || wired.has(k)) return false;
    const clear = (q: Point) => !posts.has(key(q)) && !taken.has(key(q));
    return along(c.path).every(clear) && between(p.from, c.bend).every(clear);
  };
  const order = parts
    .map((p) => ({ p, count: candidates(p).slice(0, 2).filter((c) => usable(p, c)).length }))
    .sort((a, b) => a.count - b.count);
  const out = new Map<number, Bend>();
  for (const { p } of order) {
    const pick = candidates(p).find((c) => usable(p, c));
    if (!pick) continue;
    taken.add(key(pick.bend));
    for (const q of along(pick.path)) wired.add(key(q));
    out.set(p.index, pick);
  }
  return out;
}

/**
 * The corner of a diagonal Falstad wire drawn as an L: the first of the two
 * whose legs pass no post (where our compiler would attach the wire).
 */
export function wireCorner(a: Point, b: Point, posts: Set<string>): Point {
  const corners = [{ x: b.x, y: a.y }, { x: a.x, y: b.y }];
  const clear = (c: Point) => !posts.has(key(c)) && [...between(a, c), ...between(c, b)].every((q) => !posts.has(key(q)));
  return corners.find(clear) ?? corners[0];
}
