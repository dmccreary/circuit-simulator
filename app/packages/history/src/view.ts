import type { Series } from "./columns";
import { interpolate, lowerBound, rangeSummary, timeAt, valueAtIndex } from "./query";

export interface SpanSummary {
  min: number;
  max: number;
  /** Time-weighted average (each sample weighted by its step). */
  mean: number;
  rms: number;
  approximate: boolean;
}

export interface Buckets {
  t: Float64Array; // bucket centers
  min: Float64Array; // NaN for empty buckets
  max: Float64Array;
}

/** A read-only view of one trace (or ghost) between two times. */
export interface TraceView {
  readonly trace: string;
  readonly t0: number;
  readonly t1: number;
  /** Raw samples held inside [t0, t1]. */
  readonly length: number;
  /** Copies of the raw samples inside [t0, t1]; dropped history is not included. */
  times(): Float64Array;
  values(): Float64Array;
  /** Linear interpolation; NaN outside the held data. */
  valueAt(t: number): number;
  /** Min and max per bucket over [t0, t1], for drawing one pixel column per bucket. */
  minMaxBuckets(t0: number, t1: number, buckets: number): Buckets;
  /** Min, max, mean, RMS over [t0, t1] (defaults to the view's span) from the pyramid. */
  summary(t0?: number, t1?: number): SpanSummary;
}

export function createTraceView(trace: string, s: Series, t0: number, t1: number): TraceView {
  const tc = s.time;
  const span = () => {
    const a = Math.max(lowerBound(tc, t0), tc.first);
    const b = Math.max(lowerBound(tc, t1, true), a);
    return [a, b] as const;
  };
  const [a0, b0] = span();
  return {
    trace,
    t0,
    t1,
    length: b0 - a0,
    times() {
      const [a, b] = span();
      const out = new Float64Array(b - a);
      for (let i = a; i < b; i++) out[i - a] = timeAt(tc, i);
      return out;
    },
    values() {
      const [a, b] = span();
      const out = new Float64Array(b - a);
      for (let i = a; i < b; i++) out[i - a] = valueAtIndex(s, i);
      return out;
    },
    valueAt: (t) => interpolate(s, t),
    minMaxBuckets(ta, tb, buckets) {
      const n = Math.max(0, Math.floor(buckets));
      const out: Buckets = { t: new Float64Array(n), min: new Float64Array(n), max: new Float64Array(n) };
      const width = (tb - ta) / n;
      let i0 = lowerBound(tc, ta);
      for (let k = 0; k < n; k++) {
        const lo = ta + k * width;
        const hi = k === n - 1 ? tb : ta + (k + 1) * width;
        const i1 = k === n - 1 ? lowerBound(tc, hi, true) : lowerBound(tc, hi);
        const r = rangeSummary(s, i0, i1);
        out.t[k] = (lo + hi) / 2;
        out.min[k] = r.min === Infinity ? NaN : r.min;
        out.max[k] = r.max === -Infinity ? NaN : r.max;
        i0 = i1;
      }
      return out;
    },
    summary(ta = t0, tb = t1) {
      const r = rangeSummary(s, lowerBound(tc, ta), lowerBound(tc, tb, true));
      const empty = r.min === Infinity;
      return {
        min: empty ? NaN : r.min,
        max: empty ? NaN : r.max,
        mean: r.w > 0 ? r.sum / r.w : empty ? NaN : (r.min + r.max) / 2,
        rms: r.w > 0 ? Math.sqrt(r.sumSq / r.w) : empty ? NaN : Math.abs(r.min),
        approximate: r.approximate,
      };
    },
  };
}
