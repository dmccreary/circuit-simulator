// Time-scale estimate (simulation-engine.md §2.5).
//
// The design sketches open-circuit time constants per element. We get the same
// numbers, plus LC resonances that per-element constants miss, from the
// linearized circuit itself: stamping backward Euler at two step sizes splits
// A(h) = G + C/h, and the nonzero eigenvalues mu of G^-1 C are -1/s for each
// natural frequency s. Only the columns where C is nonzero matter, so the
// eigenproblem is as small as the number of reactive unknowns.

import type { StepInfo } from "@cs/elements";
import { MnaSystem } from "./assembly";
import { VectorView, type Circuit } from "./circuit";
import { eigenvalues } from "./eigen";
import { DenseLU, SingularError } from "./solver";
import { stampStatic, stampStep } from "./stamping";

export interface TimeScales {
  /** Seconds; drives the step limit. 0 when kind is "static". */
  fastest: number;
  /** Seconds; drives Fit to circuit. 0 when kind is "static". */
  dominant: number;
  sourcePeriods: number[];
  kind: "transient" | "periodic" | "static";
}

const TWO_PI = 6.283185307179586;
/** Modes slower than this are floating nodes held only by gmin; ignore them. */
const MAX_TAU = 1e5;
const MIN_TAU = 1e-15;

export function sourcePeriods(c: Circuit): number[] {
  // The contract has no "period" query, so read the conventional prop names.
  const out: number[] = [];
  for (const el of c.netlist.elements) {
    const f = el.props.frequency ?? el.props.freq;
    if (typeof f === "number" && f > 0 && Number.isFinite(f)) out.push(1 / f);
  }
  return out;
}

/** Natural time scales of the circuit linearized at x: decay constants and oscillation periods. */
export function naturalTimeScales(c: Circuit, x: Float64Array, t: number): number[] {
  const n = c.size;
  if (n === 0) return [];
  const sys = new MnaSystem(n);
  stampStatic(c, sys);
  const view = new VectorView(x);
  const step = (dt: number): StepInfo => ({ kind: "transient", t, dt, method: "be", gmin: 1e-12, sourceScale: 1 });
  stampStep(c, sys, step(1), view, 0);
  const A1 = Float64Array.from(sys.A);
  stampStep(c, sys, step(0.5), view, 0);
  const A2 = sys.A;
  // A(h) = G + C/h  =>  C = A(0.5) - A(1),  G = 2 A(1) - A(0.5)
  const C = new Float64Array(n * n);
  const G = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) {
    C[i] = A2[i] - A1[i];
    G[i] = 2 * A1[i] - A2[i];
  }
  let scale = 1e-300;
  for (let i = 0; i < n * n; i++) scale = Math.max(scale, Math.abs(A1[i]));
  for (let i = 0; i < n * n; i++) if (Math.abs(C[i]) <= 1e-13 * scale) C[i] = 0;
  for (let u = 0; u < c.nodeCount; u++) G[u * n + u] += 1e-12;

  const S: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++)
      if (C[i * n + j] !== 0) {
        S.push(j);
        break;
      }
  }
  if (S.length === 0) return [];

  const lu = new DenseLU();
  lu.analyze({ size: n });
  try {
    lu.factor(G);
  } catch (e) {
    if (e instanceof SingularError) return [];
    throw e;
  }
  const k = S.length;
  const K = new Float64Array(k * k);
  const col = new Float64Array(n);
  S.forEach((j, cj) => {
    for (let i = 0; i < n; i++) col[i] = C[i * n + j];
    lu.solve(col);
    S.forEach((i, ci) => {
      K[ci * k + cj] = col[i];
    });
  });
  const eig = eigenvalues(K, k);
  if (!eig) return [];
  const out: number[] = [];
  for (let i = 0; i < k; i++) {
    const re = eig.re[i];
    const im = eig.im[i];
    const mag2 = re * re + im * im;
    const mag = Math.sqrt(mag2);
    if (!(mag > MIN_TAU)) continue;
    // s = -1/mu
    const sRe = Math.abs(re / mag2);
    const sIm = Math.abs(im / mag2);
    if (sIm > 1e-9 * (sRe + sIm)) {
      const period = TWO_PI / sIm;
      if (period < MAX_TAU) out.push(period);
      if (sRe > 0 && 1 / sRe < MAX_TAU) out.push(1 / sRe);
    } else if (sRe > 0 && 1 / sRe < MAX_TAU) {
      out.push(1 / sRe);
    }
  }
  return out;
}

export function computeTimeScales(c: Circuit, x: Float64Array, t: number): TimeScales {
  const taus = naturalTimeScales(c, x, t);
  const periods = sourcePeriods(c);
  const all = taus.concat(periods);
  if (all.length === 0) return { fastest: 0, dominant: 0, sourcePeriods: [], kind: "static" };
  const fastest = all.reduce((a, b) => Math.min(a, b));
  const dominant = (taus.length > 0 ? taus : periods).reduce((a, b) => Math.max(a, b));
  return { fastest, dominant, sourcePeriods: periods, kind: periods.length > 0 ? "periodic" : "transient" };
}
