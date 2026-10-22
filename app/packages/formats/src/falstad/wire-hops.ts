// CircuitJS1 joins posts only where they share a point (SimulationManager.pointKey);
// a wire that runs straight past another wire's end or a part's post does not
// connect to it. Our compiler attaches anything that ends on the middle of a
// wire (EDT-11), so such a Falstad wire is imported with a one-square hop
// around each point it passes, keeping the two nets apart as in Falstad.

import type { Point } from "@cs/model";
import type { FalstadElement } from "./text";

const key = (p: Point) => `${p.x},${p.y}`;

/** Codes whose points are not posts (text, box, line drawings, canvas scopes). */
const NOT_POSTS = new Set(["x", "b", "423", "403"]);

/** Grid keys of every Falstad end point (wire ends, element points). */
export function falstadPoints(els: FalstadElement[], g: (x: number, y: number) => Point): Set<string> {
  const out = new Set<string>();
  for (const e of els) {
    if (NOT_POSTS.has(e.code)) continue;
    out.add(key(g(e.x1, e.y1)));
    if (e.code !== "207") out.add(key(g(e.x2, e.y2)));
  }
  return out;
}

/**
 * The polyline for a straight wire a-b that must not touch the points of
 * `posts` lying strictly inside it: a detour one square to the side around
 * each such point (or run of points). Null when the wire needs no hop or no
 * clear side exists (the wire is then imported straight).
 */
export function hopRoute(a: Point, b: Point, posts: Set<string>): Point[] | null {
  if (a.x !== b.x && a.y !== b.y) return null;
  const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
  if (len < 2) return null;
  const d = { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) };
  const at = (k: number, side = 0, n = { x: -d.y, y: d.x }): Point => ({ x: a.x + d.x * k + n.x * side, y: a.y + d.y * k + n.y * side });
  const inside: number[] = [];
  for (let k = 1; k < len; k++) if (posts.has(key(at(k)))) inside.push(k);
  if (!inside.length) return null;

  // Group points closer than three squares into one hop: [from, to] along the wire.
  const hops: [number, number][] = [];
  for (const k of inside) {
    const last = hops[hops.length - 1];
    if (last && k - 1 <= last[1] + 1) last[1] = k + 1;
    else hops.push([k - 1, k + 1]);
  }
  const out: Point[] = [at(0)];
  for (const [from, to] of hops) {
    const end = Math.min(to, len);
    const side = [1, -1].find((s) => {
      for (let k = from; k <= end; k++) if (posts.has(key(at(k, s)))) return false;
      return true;
    });
    if (side === undefined) return null;
    if (from > 0) out.push(at(from));
    out.push(at(from, side), at(end, side));
    if (end < len) out.push(at(end));
  }
  const last = at(len);
  const tail = out[out.length - 1];
  if (tail.x !== last.x || tail.y !== last.y) out.push(last);
  return out;
}
