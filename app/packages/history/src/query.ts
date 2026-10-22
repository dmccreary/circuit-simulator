// Read-side operations over a Series: time search, range summaries from the
// pyramid, interpolation.

import { CHUNK, CHUNK_BITS, LEVELS, blockBits, type Series, type TimeColumn } from "./columns";

export const timeAt = (tc: TimeColumn, i: number): number => {
  const c = tc.chunks[i >> CHUNK_BITS];
  return c ? c[i & (CHUNK - 1)] : NaN;
};

export const valueAtIndex = (s: Series, i: number): number => {
  const c = s.values.chunks[i >> CHUNK_BITS];
  return c ? c[i & (CHUNK - 1)] : NaN;
};

/** Weight of sample i: the step that produced it (0 for the first sample). */
export const stepAt = (tc: TimeColumn, i: number): number => {
  if (i <= 0) return 0;
  const d = timeAt(tc, i) - timeAt(tc, i - 1);
  return Number.isNaN(d) ? 0 : d;
};

/**
 * First index whose time is >= t (or > t when `strict`). In the dropped part
 * of the history the answer is rounded to a 64-sample block.
 */
export function lowerBound(tc: TimeColumn, t: number, strict = false): number {
  const n = tc.length;
  if (n === 0) return 0;
  const before = (x: number) => (strict ? x <= t : x < t);
  let lo = tc.first;
  if (lo > 0 && !before(timeAt(tc, lo))) {
    // Search dropped history by block end times.
    const tl = tc.tLast[0];
    let a = 0;
    let b = Math.min(tl.n, lo >> blockBits(1));
    while (a < b) {
      const m = (a + b) >> 1;
      if (before(tl.a[m])) a = m + 1;
      else b = m;
    }
    return Math.min(a << blockBits(1), lo);
  }
  let hi = n;
  while (lo < hi) {
    const m = (lo + hi) >>> 1;
    if (before(timeAt(tc, m))) lo = m + 1;
    else hi = m;
  }
  return lo;
}

export interface RangeSummary {
  min: number;
  max: number;
  /** Time-weighted sums: Σ v·dt, Σ v²·dt, Σ dt. */
  sum: number;
  sumSq: number;
  w: number;
  /** True when part of the range came from coarse summaries of dropped history. */
  approximate: boolean;
}

/** Summary over sample indices [i0, i1), using whole pyramid blocks where they fit. */
export function rangeSummary(s: Series, i0: number, i1: number): RangeSummary {
  const out: RangeSummary = { min: Infinity, max: -Infinity, sum: 0, sumSq: 0, w: 0, approximate: false };
  const tc = s.time;
  const p = s.values.pyr;
  i1 = Math.min(i1, tc.length);
  let i = Math.max(0, i0);
  const mergeBlock = (l: number, b: number) => {
    if (p.min[l].a[b] < out.min) out.min = p.min[l].a[b];
    if (p.max[l].a[b] > out.max) out.max = p.max[l].a[b];
    out.sum += p.sum[l].a[b];
    out.sumSq += p.sumSq[l].a[b];
    out.w += p.w[l].a[b];
  };
  outer: while (i < i1) {
    for (let l = LEVELS - 1; l >= 0; l--) {
      const bits = blockBits(l + 1);
      const size = 1 << bits;
      if ((i & (size - 1)) === 0 && i + size <= i1 && (i >> bits) < p.min[l].n) {
        mergeBlock(l, i >> bits);
        i += size;
        continue outer;
      }
    }
    if (i >= tc.first) {
      const v = valueAtIndex(s, i);
      if (!Number.isNaN(v)) {
        const dt = stepAt(tc, i);
        if (v < out.min) out.min = v;
        if (v > out.max) out.max = v;
        out.sum += v * dt;
        out.sumSq += v * v * dt;
        out.w += dt;
      }
      i++;
    } else {
      // Dropped history, unaligned: use the whole 64-sample block around i.
      const b = i >> blockBits(1);
      if (b < p.min[0].n) mergeBlock(0, b);
      out.approximate = true;
      i = (b + 1) << blockBits(1);
    }
  }
  return out;
}

/** Linear interpolation between the samples either side of t; NaN outside the held raw data. */
export function interpolate(s: Series, t: number): number {
  const tc = s.time;
  const i = lowerBound(tc, t);
  if (i >= tc.length || i < tc.first) return NaN;
  const ti = timeAt(tc, i);
  if (ti === t) return valueAtIndex(s, i);
  if (i === tc.first) return NaN;
  const t0 = timeAt(tc, i - 1);
  const v0 = valueAtIndex(s, i - 1);
  const v1 = valueAtIndex(s, i);
  if (ti === t0) return v1;
  return v0 + ((v1 - v0) * (t - t0)) / (ti - t0);
}
