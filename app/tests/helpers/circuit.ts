// Shared helpers for the acceptance tests (spec §26) and user stories (§25):
// build a netlist by hand, run the real engine with the real element models,
// and read samples back in a form the measurement functions accept.

import { createEngine, type Engine } from "@cs/engine";
import { getModelFactory } from "@cs/elements/models";
import type { ChannelSpec, CircuitSettings, Netlist, NetlistElement, PropValue } from "@cs/model";

export const DEFAULT_SETTINGS: CircuitSettings = { realisticParts: false, realisticRatings: false, start: "zero", seed: 1 };

export type El = [id: string, type: string, nodes: number[], props: Record<string, PropValue>];

export function netlist(nodeCount: number, els: El[], settings: Partial<CircuitSettings> = {}): Netlist {
  const elements: NetlistElement[] = els.map(([id, type, nodes, props]) => ({ id, type, nodes, props }));
  const nodeNames = ["GND", ...Array.from({ length: nodeCount }, (_, i) => `N${i + 1}`)];
  return { nodeCount, nodeNames, elements, settings: { ...DEFAULT_SETTINGS, ...settings } };
}

export function engine(nodeCount: number, els: El[], settings: Partial<CircuitSettings> = {}): Engine {
  const e = createEngine(netlist(nodeCount, els, settings), getModelFactory);
  if (e.status !== "ok") throw new Error(`engine stopped: ${JSON.stringify(e.diagnostics)}`);
  return e;
}

/** Samples of every accepted step, channel-major, plus the step count. */
export interface Trace {
  times: number[];
  ch: Record<string, number[]>;
  steps: number;
}

export function emptyTrace(e: Engine): Trace {
  return { times: [], ch: Object.fromEntries(e.channelIds.map((id) => [id, [] as number[]])), steps: 0 };
}

/** Step the engine until simulated time `until`, appending samples to `acc`. */
export function runUntil(e: Engine, until: number, acc: Trace = emptyTrace(e)): Trace {
  const drain = () => {
    const b = e.drainSamples();
    const n = b.times.length;
    for (let i = 0; i < n; i++) acc.times.push(b.times[i]);
    e.channelIds.forEach((id, k) => {
      const col = (acc.ch[id] ??= []);
      for (let i = 0; i < n; i++) col.push(b.samples[k * n + i]);
    });
  };
  let guard = 0;
  while (e.time < until) {
    const out = e.step();
    if (!out.ok) throw new Error(`step failed at t=${e.time}: ${JSON.stringify(e.diagnostics)}`);
    acc.steps++;
    if (++guard % 4096 === 0) drain();
  }
  drain();
  return acc;
}

/** Channels, then run. */
export function simulate(e: Engine, channels: ChannelSpec[], until: number): Trace {
  e.setChannels(channels);
  return runUntil(e, until);
}

/** Linear interpolation of channel `id` at time t. */
export function valueAt(tr: Trace, id: string, t: number): number {
  const ts = tr.times;
  const v = tr.ch[id];
  if (t <= ts[0]) return v[0];
  let lo = 0;
  let hi = ts.length - 1;
  if (t >= ts[hi]) return v[hi];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] <= t) lo = mid;
    else hi = mid;
  }
  const f = ts[hi] === ts[lo] ? 0 : (t - ts[lo]) / (ts[hi] - ts[lo]);
  return v[lo] + f * (v[hi] - v[lo]);
}

/** The samples of a channel inside [t0, t1]. */
export function windowOf(tr: Trace, id: string, t0: number, t1: number): { t: number[]; v: number[] } {
  const t: number[] = [];
  const v: number[] = [];
  tr.times.forEach((x, i) => {
    if (x >= t0 && x <= t1) {
      t.push(x);
      v.push(tr.ch[id][i]);
    }
  });
  return { t, v };
}

/** Trapezoidal integral of a channel over the whole trace (or [t0, t1]). */
export function integral(tr: Trace, id: string, t0 = -Infinity, t1 = Infinity): number {
  const { t, v } = windowOf(tr, id, t0, t1);
  let s = 0;
  for (let i = 1; i < t.length; i++) s += ((v[i] + v[i - 1]) / 2) * (t[i] - t[i - 1]);
  return s;
}

/** |actual − expected| ≤ rel × |expected|, with a readable failure message. */
export function expectWithin(actual: number, expected: number, rel: number, what = "value"): void {
  const err = Math.abs(actual - expected) / Math.abs(expected);
  if (!(err <= rel)) throw new Error(`${what}: got ${actual}, expected ${expected} ±${(rel * 100).toPrecision(3)}% (off by ${(err * 100).toPrecision(3)}%)`);
}

/**
 * Least-squares time constant of an exponential approach to `final`:
 * ln|final − v| = a − t/τ, fitted over the samples where the remaining
 * distance is between 1% and 99% of the step.
 */
export function fitTimeConstant(t: number[], v: number[], t0: number, start: number, final: number): { tau: number; r2: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  const step = Math.abs(final - start);
  for (let i = 0; i < t.length; i++) {
    const rem = Math.abs(final - v[i]);
    if (t[i] > t0 && rem < 0.99 * step && rem > 0.01 * step) {
      xs.push(t[i] - t0);
      ys.push(Math.log(rem));
    }
  }
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  const slope = sxy / sxx;
  return { tau: -1 / slope, r2: (sxy * sxy) / (sxx * syy) };
}

/** Times where a channel crosses `level` going up (linear interpolation). */
export function risingCrossings(tr: Trace, id: string, level: number): number[] {
  const out: number[] = [];
  const v = tr.ch[id];
  for (let i = 1; i < v.length; i++)
    if (v[i - 1] < level && v[i] >= level) out.push(tr.times[i - 1] + ((level - v[i - 1]) * (tr.times[i] - tr.times[i - 1])) / (v[i] - v[i - 1]));
  return out;
}
