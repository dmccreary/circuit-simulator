// Parameter sweeps (ANL-17–20): for each value, apply the parameter and run
// a DC solve, a transient run (traces kept), or a transient run followed by
// a measurement. Generators, so the worker can report progress, keep partial
// results, and cancel between runs.

import { terminalCurrentOffsets, type ChannelSpec, type Netlist } from "@cs/model";
import { fillDisplay, type FactoryLookup } from "../circuit";
import { createEngine } from "../engine";
import { operatingPoint } from "./dc-op";
import { withProps } from "./netlist-edit";
import type { AnalysisProgress, ParamRef, SweepMeasure, SweepResult, SweepSeries } from "./types";

/** Most points kept per transient trace; longer runs are decimated evenly. */
export const MAX_TRACE_POINTS = 4000;
const MAX_STEPS_PER_RUN = 2_000_000;

export interface SweepJob {
  netlist: Netlist;
  sweep: "transient" | "measurement" | "dc";
  param: ParamRef;
  values: number[];
  outputs: ChannelSpec[];
  outer?: { param: ParamRef; values: number[] };
  duration?: number;
  measure?: SweepMeasure;
}

/** Linear or logarithmic values from start to stop inclusive (ANL-17). */
export function sweepValues(start: number, stop: number, steps: number, scale: "linear" | "log" = "linear"): number[] {
  const n = Math.max(1, Math.round(steps));
  if (n === 1) return [start];
  if (scale === "log" && start > 0 && stop > 0) {
    const r = Math.log(stop / start);
    return Array.from({ length: n }, (_, i) => (i === n - 1 ? stop : start * Math.exp((r * i) / (n - 1))));
  }
  return Array.from({ length: n }, (_, i) => start + ((stop - start) * i) / (n - 1));
}

export function measure(values: ArrayLike<number>, times: ArrayLike<number>, kind: SweepMeasure): number {
  const n = values.length;
  if (n === 0) return NaN;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    min = Math.min(min, values[i]);
    max = Math.max(max, values[i]);
  }
  switch (kind) {
    case "final":
      return values[n - 1];
    case "max":
      return max;
    case "min":
      return min;
    case "peakToPeak":
      return max - min;
    case "average":
    case "rms": {
      if (n === 1) return kind === "rms" ? Math.abs(values[0]) : values[0];
      // Trapezoidal time average over the variable-step trace.
      let acc = 0;
      for (let i = 1; i < n; i++) {
        const dt = times[i] - times[i - 1];
        const a = values[i - 1];
        const b = values[i];
        acc += kind === "rms" ? (dt * (a * a + a * b + b * b)) / 3 : (dt * (a + b)) / 2;
      }
      const span = times[n - 1] - times[0];
      if (!(span > 0)) return NaN;
      return kind === "rms" ? Math.sqrt(acc / span) : acc / span;
    }
  }
}

function decimate(times: Float64Array, cols: Float64Array[]): { x: number[]; ys: number[][] } {
  const n = times.length;
  const stride = Math.max(1, Math.ceil(n / MAX_TRACE_POINTS));
  const x: number[] = [];
  const ys: number[][] = cols.map(() => []);
  for (let i = 0; i < n; i += stride) {
    x.push(times[i]);
    cols.forEach((c, k) => ys[k].push(c[i]));
  }
  if (n > 0 && (n - 1) % stride !== 0) {
    x.push(times[n - 1]);
    cols.forEach((c, k) => ys[k].push(c[n - 1]));
  }
  return { x, ys };
}

/** One transient run from reset; null if the engine stopped. */
export function transientRun(netlist: Netlist, lookup: FactoryLookup, outputs: ChannelSpec[], duration: number): { times: Float64Array; cols: Float64Array[] } | null {
  const e = createEngine(netlist, lookup);
  if (e.status !== "ok") return null;
  e.setChannels(outputs);
  // Initial sample at t = 0 from the solved starting state.
  const first = evaluateChannels(outputs, netlist, e.displayState());
  let steps = 0;
  while (e.time < duration && steps < MAX_STEPS_PER_RUN) {
    const out = e.step();
    steps++;
    if (!out.ok || e.status !== "ok") return null;
  }
  const block = e.drainSamples();
  const n = block.times.length;
  const times = new Float64Array(n + 1);
  times.set(block.times, 1);
  const cols = outputs.map((_, k) => {
    const col = new Float64Array(n + 1);
    col[0] = first[k];
    col.set(block.samples.subarray(k * n, (k + 1) * n), 1);
    return col;
  });
  return clipAt(times, cols, duration);
}

/** Drop samples past `end`, ending exactly at `end` by linear interpolation. */
function clipAt(times: Float64Array, cols: Float64Array[], end: number): { times: Float64Array; cols: Float64Array[] } {
  let m = times.length;
  while (m > 1 && times[m - 2] >= end) m--;
  if (m === 0 || times[m - 1] <= end) return { times: times.subarray(0, m), cols: cols.map((c) => c.subarray(0, m)) };
  const ta = times[m - 2];
  const tb = times[m - 1];
  const u = tb > ta ? (end - ta) / (tb - ta) : 1;
  const t = times.slice(0, m);
  t[m - 1] = end;
  return {
    times: t,
    cols: cols.map((c) => {
      const out = c.slice(0, m);
      out[m - 1] = c[m - 2] + u * (c[m - 1] - c[m - 2]);
      return out;
    }),
  };
}

/** Channel values from a display state (layout of displayStateSize in @cs/model). */
export function evaluateChannels(specs: readonly ChannelSpec[], netlist: Netlist, d: ArrayLike<number>): Float64Array {
  const offs = terminalCurrentOffsets(netlist);
  const base = netlist.nodeCount + 1;
  const index = (id: string) => netlist.elements.findIndex((el) => el.id === id);
  return Float64Array.from(
    specs.map((s) => {
      switch (s.kind) {
        case "voltage":
          return (d[s.a] ?? NaN) - (d[s.b] ?? NaN);
        case "current": {
          const i = index(s.element);
          return i < 0 || s.terminal >= netlist.elements[i].nodes.length ? NaN : d[base + offs[i] + s.terminal];
        }
        case "power": {
          const i = index(s.element);
          if (i < 0) return NaN;
          let p = 0;
          netlist.elements[i].nodes.forEach((n, k) => (p += d[n] * d[base + offs[i] + k]));
          return p;
        }
        default:
          return NaN;
      }
    }),
  );
}

export function* sweepAnalysis(job: SweepJob, lookup: FactoryLookup): Generator<AnalysisProgress, SweepResult> {
  const result: SweepResult = { kind: "sweep", sweep: job.sweep, param: job.param, values: job.values.slice(), series: [], failed: [] };
  const ids = job.outputs.map((o) => o.id);
  if (job.sweep === "dc") {
    const outers = job.outer ? job.outer.values : [undefined];
    const total = outers.length * job.values.length;
    let done = 0;
    for (const ov of outers) {
      const s: SweepSeries = { value: ov, x: [], y: Object.fromEntries(ids.map((id) => [id, [] as number[]])) };
      result.series.push(s);
      let guess: Float64Array | null = null;
      for (const v of job.values) {
        const overrides = [{ ...job.param, value: v }];
        if (job.outer && ov !== undefined) overrides.push({ ...job.outer.param, value: ov });
        const op = operatingPoint(withProps(job.netlist, overrides), lookup, guess);
        s.x.push(v);
        if (op.x) {
          guess = op.x;
          const c = op.circuit;
          const display = new Float64Array(c.displaySize);
          fillDisplay(c, op.x, display);
          const vals = evaluateChannels(job.outputs, c.netlist, display);
          ids.forEach((id, k) => s.y[id].push(vals[k]));
        } else {
          result.failed.push(v);
          ids.forEach((id) => s.y[id].push(NaN));
        }
        done++;
        if (done % 10 === 0 && done < total) yield { fraction: done / total, partial: result };
      }
    }
    return result;
  }

  const duration = job.duration && job.duration > 0 ? job.duration : 0.01;
  const kind = job.measure ?? "final";
  const curve: SweepSeries | undefined =
    job.sweep === "measurement" ? { x: [], y: Object.fromEntries(ids.map((id) => [id, [] as number[]])) } : undefined;
  if (curve) result.series.push(curve);
  for (let i = 0; i < job.values.length; i++) {
    const v = job.values[i];
    const run = transientRun(withProps(job.netlist, [{ ...job.param, value: v }]), lookup, job.outputs, duration);
    if (!run) result.failed.push(v);
    if (curve) {
      curve.x.push(v);
      ids.forEach((id, k) => curve.y[id].push(run ? measure(run.cols[k], run.times, kind) : NaN));
    } else if (run) {
      const d = decimate(run.times, run.cols);
      result.series.push({ value: v, x: d.x, y: Object.fromEntries(ids.map((id, k) => [id, d.ys[k]])) });
    }
    if (i + 1 < job.values.length) yield { fraction: (i + 1) / job.values.length, partial: result };
  }
  return result;
}
