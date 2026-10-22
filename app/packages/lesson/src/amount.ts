import { parseValue } from "@cs/units";
import type { Amount, Compare, Tolerance } from "./types";

/** "2.5 V", "10k", "100 µF", 4.7 -> SI number; null when it cannot be read. */
export function amount(a: Amount | undefined): number | null {
  if (a === undefined) return null;
  if (typeof a === "number") return Number.isFinite(a) ? a : null;
  const s = a.trim();
  if (s === "") return null;
  const n = Number(s);
  if (Number.isFinite(n)) return n;
  return parseValue(s);
}

/** Absolute width of a tolerance around `target`. Relative tolerances end in "%". */
export function toleranceWidth(tol: Tolerance | undefined, target: number): number | null {
  if (tol === undefined) return 0;
  if (typeof tol === "string" && tol.trim().endsWith("%")) {
    const pct = Number(tol.trim().slice(0, -1).trim());
    return Number.isFinite(pct) && pct >= 0 ? (Math.abs(target) * pct) / 100 : null;
  }
  const w = amount(tol);
  return w === null || w < 0 ? null : w;
}

export const isTolerance = (t: unknown): boolean =>
  (typeof t === "number" || typeof t === "string") && toleranceWidth(t as Tolerance, 1) !== null;

/** Whether a value satisfies every comparison given. Exact equality uses a tiny relative slack. */
export function compare(v: number, c: Compare): boolean {
  if (!Number.isFinite(v)) return false;
  if (c.equals !== undefined) {
    const target = amount(c.equals);
    if (target === null) return false;
    const w = c.tolerance === undefined ? Math.abs(target) * 1e-9 + 1e-12 : toleranceWidth(c.tolerance, target);
    if (w === null || Math.abs(v - target) > w) return false;
  }
  if (c.above !== undefined) {
    const a = amount(c.above);
    if (a === null || !(v > a)) return false;
  }
  if (c.below !== undefined) {
    const b = amount(c.below);
    if (b === null || !(v < b)) return false;
  }
  if (c.within !== undefined) {
    const lo = amount(c.within[0]);
    const hi = amount(c.within[1]);
    if (lo === null || hi === null || v < Math.min(lo, hi) || v > Math.max(lo, hi)) return false;
  }
  return true;
}

/** "1 s", "500ms", 0.5 -> seconds. */
export const seconds = (a: Amount | undefined): number | null => amount(a);
