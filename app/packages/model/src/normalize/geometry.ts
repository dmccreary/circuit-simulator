import { pointKey } from "../netlist";
import type { Point } from "../types";

export const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

/** True when p lies on the closed segment a–b (axis-aligned or not). */
export function onSegment(p: Point, a: Point, b: Point): boolean {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  if (Math.abs(cross) > 1e-9) return false;
  return p.x >= Math.min(a.x, b.x) - 1e-9 && p.x <= Math.max(a.x, b.x) + 1e-9 && p.y >= Math.min(a.y, b.y) - 1e-9 && p.y <= Math.max(a.y, b.y) + 1e-9;
}

/** Strictly between the endpoints. */
export const insideSegment = (p: Point, a: Point, b: Point) => onSegment(p, a, b) && !same(p, a) && !same(p, b);

/** Fraction along a–b of a point on it. */
export function paramOf(p: Point, a: Point, b: Point): number {
  const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
  return len === 0 ? 0 : (Math.abs(p.x - a.x) + Math.abs(p.y - a.y)) / len;
}

/** a -> b -> c continues in the same straight direction. */
export function straightThrough(a: Point, b: Point, c: Point): boolean {
  const d1 = { x: b.x - a.x, y: b.y - a.y };
  const d2 = { x: c.x - b.x, y: c.y - b.y };
  return d1.x * d2.y - d1.y * d2.x === 0 && d1.x * d2.x + d1.y * d2.y > 0;
}

export const key = pointKey;

export function dedupe(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) if (out.length === 0 || !same(out[out.length - 1], p)) out.push({ x: p.x, y: p.y });
  return out;
}
