import type { Point } from "@cs/model";

/** Distance between dots along a path, grid units. Constant so dot rate ∝ current (ANI-04). */
export const DOT_SPACING = 1;
/** Auto scale: the largest visible current moves this many grid units per second. */
export const AUTO_TARGET_SPEED = 4;
/** Below this speed (grid/s) dots stand still and shimmer (ANI-06). */
export const TRICKLE_SPEED = 0.05;
/** Above this speed (grid/s) dots are capped and drawn as streaks (ANI-06). */
export const SPEED_CAP = 30;

/** Phase change for one segment: speed(I) × Δt / spacing, with the cap applied. */
export function phaseDelta(current: number, k: number, dt: number, spacing = DOT_SPACING): number {
  let speed = k * current;
  if (Math.abs(speed) < TRICKLE_SPEED) return 0;
  if (Math.abs(speed) > SPEED_CAP) speed = Math.sign(speed) * SPEED_CAP;
  return (speed * dt) / spacing;
}

export const frac = (x: number): number => x - Math.floor(x);

/**
 * Distances along a path of length `len` where dots sit for a given phase.
 * Positive phase change moves dots from the path's start toward its end.
 */
export function dotOffsets(phase: number, len: number, spacing = DOT_SPACING): number[] {
  const out: number[] = [];
  const f = frac(phase);
  for (let i = 0; (i + f) * spacing <= len + 1e-9; i++) out.push((i + f) * spacing);
  return out;
}

export function polylineLength(pts: readonly Point[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

/** The point at distance d along a polyline. */
export function pointAlong(pts: readonly Point[], d: number): Point {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (d <= l || i === pts.length - 1) {
      const t = l === 0 ? 0 : Math.min(1, d / l);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    d -= l;
  }
  return pts[0];
}

/**
 * Auto current scale (rendering.md §3.1): k puts the largest current at
 * AUTO_TARGET_SPEED, and is re-chosen only after that current has differed
 * by more than 10× for a full real second.
 */
export class AutoScale {
  k = 0;
  private ref = 0;
  private driftSince: number | undefined;

  update(maxCurrent: number, now: number): number {
    const m = Math.abs(maxCurrent);
    if (!(m > 0) || !Number.isFinite(m)) {
      return this.k;
    }
    if (this.ref === 0) {
      this.setRef(m);
      return this.k;
    }
    const ratio = m / this.ref;
    if (ratio > 10 || ratio < 0.1) {
      if (this.driftSince === undefined) this.driftSince = now;
      else if (now - this.driftSince >= 1) this.setRef(m);
    } else {
      this.driftSince = undefined;
    }
    return this.k;
  }

  reset(): void {
    this.k = 0;
    this.ref = 0;
    this.driftSince = undefined;
  }

  private setRef(m: number): void {
    this.ref = m;
    this.k = AUTO_TARGET_SPEED / m;
    this.driftSince = undefined;
  }
}
