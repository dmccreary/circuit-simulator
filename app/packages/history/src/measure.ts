// Measurement library (history-and-analysis.md §4.1). Pure functions over
// sample arrays (times, values), e.g. from TraceView.times()/values().
// Averages are time-weighted (trapezoidal), so variable steps do not bias them.

import type { MessageRef } from "@cs/model";

export type Samples = ArrayLike<number>;

export type MeasureResult =
  | { ok: true; value: number; provenance: MessageRef }
  | { ok: false; reason: MessageRef };

const fail = (key: string, values?: MessageRef["values"]): MeasureResult => ({ ok: false, reason: { key, values } });
const okSpan = (value: number, t: Samples): MeasureResult => ({
  ok: true,
  value,
  provenance: { key: "measure.span", values: { t0: t[0], t1: t[t.length - 1] } },
});

/** Indices of finite samples. NaN marks "no data" in the history store. */
function finite(t: Samples, v: Samples): { t: number[]; v: number[] } {
  const ot: number[] = [];
  const ov: number[] = [];
  for (let i = 0; i < Math.min(t.length, v.length); i++) {
    if (Number.isFinite(v[i]) && Number.isFinite(t[i])) {
      ot.push(t[i]);
      ov.push(v[i]);
    }
  }
  return { t: ot, v: ov };
}

function integrate(t: number[], v: number[], f: (x: number) => number): number {
  let s = 0;
  for (let i = 1; i < t.length; i++) s += ((f(v[i - 1]) + f(v[i])) / 2) * (t[i] - t[i - 1]);
  return s;
}

export function mean(times: Samples, values: Samples): MeasureResult {
  const { t, v } = finite(times, values);
  if (t.length === 0) return fail("measure.noData");
  const T = t[t.length - 1] - t[0];
  if (T <= 0) return okSpan(v.reduce((a, b) => a + b, 0) / v.length, t);
  return okSpan(integrate(t, v, (x) => x) / T, t);
}

export function rms(times: Samples, values: Samples): MeasureResult {
  const { t, v } = finite(times, values);
  if (t.length === 0) return fail("measure.noData");
  const T = t[t.length - 1] - t[0];
  if (T <= 0) return okSpan(Math.sqrt(v.reduce((a, b) => a + b * b, 0) / v.length), t);
  return okSpan(Math.sqrt(integrate(t, v, (x) => x * x) / T), t);
}

export function min(times: Samples, values: Samples): MeasureResult {
  const { t, v } = finite(times, values);
  return v.length ? okSpan(Math.min(...v), t) : fail("measure.noData");
}

export function max(times: Samples, values: Samples): MeasureResult {
  const { t, v } = finite(times, values);
  return v.length ? okSpan(Math.max(...v), t) : fail("measure.noData");
}

export function peakToPeak(times: Samples, values: Samples): MeasureResult {
  const { t, v } = finite(times, values);
  return v.length ? okSpan(Math.max(...v) - Math.min(...v), t) : fail("measure.noData");
}

export interface CrossingOptions {
  /** Level to cross; defaults to the trace's time-weighted mean. */
  level?: number;
  /** Hysteresis band as a fraction of peak-to-peak (default 0.05). */
  hysteresis?: number;
}

export interface Crossings {
  rising: number[];
  falling: number[];
  level: number;
}

/**
 * Times where the signal crosses `level`, located by linear interpolation.
 * A crossing counts only after the signal has gone past the far side of the
 * hysteresis band, so noise near the level does not add extra crossings.
 */
export function crossings(times: Samples, values: Samples, opts: CrossingOptions = {}): Crossings {
  const { t, v } = finite(times, values);
  const out: Crossings = { rising: [], falling: [], level: NaN };
  if (t.length < 2) return out;
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const level = opts.level ?? (mean(t, v) as { value: number }).value;
  out.level = level;
  const h = ((opts.hysteresis ?? 0.05) * (hi - lo)) / 2;
  let state: "low" | "high" | null = v[0] <= level - h ? "low" : v[0] >= level + h ? "high" : null;
  let candidate = NaN; // last time the signal crossed `level` itself
  for (let i = 1; i < t.length; i++) {
    const a = v[i - 1];
    const b = v[i];
    if ((a < level && b >= level) || (a > level && b <= level)) {
      candidate = b === a ? t[i] : t[i - 1] + ((level - a) * (t[i] - t[i - 1])) / (b - a);
    }
    if (b >= level + h && state !== "high") {
      if (state === "low") out.rising.push(Number.isNaN(candidate) ? t[i] : candidate);
      state = "high";
      candidate = NaN;
    } else if (b <= level - h && state !== "low") {
      if (state === "high") out.falling.push(Number.isNaN(candidate) ? t[i] : candidate);
      state = "low";
      candidate = NaN;
    }
  }
  return out;
}

/** Average period over whole periods between the first and last rising crossings. */
export function period(times: Samples, values: Samples, opts: CrossingOptions = {}): MeasureResult {
  const { rising } = crossings(times, values, opts);
  if (rising.length < 2) return fail("measure.needTwoPeriods");
  const periods = rising.length - 1;
  return {
    ok: true,
    value: (rising[rising.length - 1] - rising[0]) / periods,
    provenance: { key: "measure.wholePeriods", values: { periods, t0: rising[0] } },
  };
}

export function frequency(times: Samples, values: Samples, opts: CrossingOptions = {}): MeasureResult {
  const p = period(times, values, opts);
  if (!p.ok) return p;
  return { ...p, value: 1 / p.value };
}

/** Fraction of each whole period spent above the level. */
export function dutyCycle(times: Samples, values: Samples, opts: CrossingOptions = {}): MeasureResult {
  const { rising, falling } = crossings(times, values, opts);
  if (rising.length < 2) return fail("measure.needTwoPeriods");
  const start = rising[0];
  const end = rising[rising.length - 1];
  let high = 0;
  for (let k = 0; k < rising.length - 1; k++) {
    const f = falling.find((x) => x > rising[k] && x < rising[k + 1]);
    if (f === undefined) return fail("measure.noFallingEdge");
    high += f - rising[k];
  }
  return {
    ok: true,
    value: high / (end - start),
    provenance: { key: "measure.wholePeriods", values: { periods: rising.length - 1, t0: start } },
  };
}

export interface EdgeOptions {
  /** Lower and upper fractions of the step (default 0.1 and 0.9). */
  lowFraction?: number;
  highFraction?: number;
}

/** Time of the first transition between the step's levels (min and max of the span). */
function edgeTime(times: Samples, values: Samples, rising: boolean, opts: EdgeOptions): MeasureResult {
  const { t, v } = finite(times, values);
  if (t.length < 2) return fail("measure.noData");
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  if (hi === lo) return fail("measure.noStep");
  const fl = opts.lowFraction ?? 0.1;
  const fh = opts.highFraction ?? 0.9;
  const a = lo + fl * (hi - lo);
  const b = lo + fh * (hi - lo);
  // Rising: leave `a` upward, then reach `b`. Falling: leave `b` downward, then reach `a`.
  const [first, second] = rising ? [a, b] : [b, a];
  const cross = (i: number, level: number) => t[i - 1] + ((level - v[i - 1]) * (t[i] - t[i - 1])) / (v[i] - v[i - 1]);
  const beyond = (x: number, level: number) => (rising ? x >= level : x <= level);
  let tStart = NaN;
  let armed = !beyond(v[0], first);
  for (let i = 1; i < t.length; i++) {
    if (!armed) {
      if (!beyond(v[i], first)) armed = true;
      continue;
    }
    if (Number.isNaN(tStart) && beyond(v[i], first)) tStart = cross(i, first);
    if (!Number.isNaN(tStart)) {
      if (!beyond(v[i], first)) {
        tStart = NaN; // fell back before completing the edge
        continue;
      }
      if (beyond(v[i], second)) {
        const tEnd = cross(i, second);
        return {
          ok: true,
          value: tEnd - tStart,
          provenance: { key: rising ? "measure.firstRisingEdge" : "measure.firstFallingEdge", values: { t0: tStart } },
        };
      }
    }
  }
  return fail(rising ? "measure.noRisingEdge" : "measure.noFallingEdge");
}

export const riseTime = (t: Samples, v: Samples, opts: EdgeOptions = {}) => edgeTime(t, v, true, opts);
export const fallTime = (t: Samples, v: Samples, opts: EdgeOptions = {}) => edgeTime(t, v, false, opts);

export type MeasurementFn = (t: Samples, v: Samples) => MeasureResult;

/** Lookup by MeasurementSpec.kind. */
export const MEASUREMENTS: Record<string, MeasurementFn> = {
  mean,
  rms,
  min,
  max,
  peakToPeak,
  period: (t, v) => period(t, v),
  frequency: (t, v) => frequency(t, v),
  dutyCycle: (t, v) => dutyCycle(t, v),
  riseTime: (t, v) => riseTime(t, v),
  fallTime: (t, v) => fallTime(t, v),
};
