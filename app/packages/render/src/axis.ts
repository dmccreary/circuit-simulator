/** Smallest 1, 2, or 5 × 10^n that is ≥ x (x > 0). */
export function niceCeil(x: number): number {
  if (!(x > 0)) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  for (const m of [1, 2, 5, 10]) if (m * p >= x * (1 - 1e-12)) return m * p;
  return 10 * p;
}

/** A 1-2-5 step giving roughly `target` intervals across [min, max]. */
export function niceStep(span: number, target = 5): number {
  if (!(span > 0)) return 1;
  const raw = span / target;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  let best = p;
  for (const m of [1, 2, 5, 10]) {
    if (Math.abs(span / (m * p) - target) < Math.abs(span / best - target)) best = m * p;
  }
  return best;
}

/** Tick values in [min, max] on a 1-2-5 step (rendering.md §5). */
export function niceTicks(min: number, max: number, target = 5): { step: number; ticks: number[] } {
  if (max < min) [min, max] = [max, min];
  const step = niceStep(max - min, target);
  const ticks: number[] = [];
  const first = Math.ceil(min / step - 1e-9);
  for (let i = first; i * step <= max + step * 1e-9; i++) {
    // Rounding to the step's precision avoids 0.30000000000000004 labels.
    ticks.push(Number((i * step).toPrecision(12)));
  }
  return { step, ticks };
}

export interface Range {
  min: number;
  max: number;
}

/**
 * Auto vertical range (CHT-12): expands at once, shrinks only after the data
 * used less than a quarter of it for two real seconds; bounds on 1-2-5 values.
 */
export class AutoRange {
  range: Range | undefined;
  private smallSince: number | undefined;

  update(dataMin: number, dataMax: number, now: number): Range {
    if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax)) return this.range ?? { min: -1, max: 1 };
    const target = roundOut(dataMin, dataMax);
    const r = this.range;
    if (!r) return (this.range = target);
    if (dataMin < r.min || dataMax > r.max) {
      this.smallSince = undefined;
      return (this.range = { min: Math.min(r.min, target.min), max: Math.max(r.max, target.max) });
    }
    const used = (dataMax - dataMin) / (r.max - r.min);
    if (used < 0.25) {
      if (this.smallSince === undefined) this.smallSince = now;
      else if (now - this.smallSince >= 2) {
        this.smallSince = undefined;
        return (this.range = target);
      }
    } else {
      this.smallSince = undefined;
    }
    return r;
  }

  reset(): void {
    this.range = undefined;
    this.smallSince = undefined;
  }
}

/** Range covering [lo, hi] with ends on 1-2-5 values; always includes 0 when close. */
export function roundOut(lo: number, hi: number): Range {
  if (hi - lo < 1e-15) {
    const m = Math.abs(hi) || 1;
    lo -= m * 0.5;
    hi += m * 0.5;
  }
  const max = hi > 0 ? niceCeil(hi * 1.05) : -niceFloorAbs(-hi);
  const min = lo < 0 ? -niceCeil(-lo * 1.05) : niceFloorAbs(lo);
  return { min, max };
}

/** Largest 1-2-5 value ≤ x for x ≥ 0, or 0 when x is small relative to itself. */
function niceFloorAbs(x: number): number {
  if (!(x > 0)) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  for (const m of [5, 2, 1]) if (m * p <= x) return m * p;
  return 0;
}

/** Visible time window for the chart (CHT-07–09). */
export function chartWindow(mode: "roll" | "sweep", latest: number, span: number): { t0: number; t1: number } {
  if (mode === "sweep") {
    const start = Math.floor(latest / span) * span;
    return { t0: start, t1: start + span };
  }
  return latest < span ? { t0: 0, t1: span } : { t0: latest - span, t1: latest };
}
