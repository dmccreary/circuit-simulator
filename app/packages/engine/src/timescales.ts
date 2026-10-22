// Time-scale estimate (simulation-engine.md §2.5).
//
// The design sketches open-circuit time constants per element. We get the same
// numbers, plus LC resonances that per-element constants miss, from the
// linearized circuit itself: stamping backward Euler at two step sizes splits
// A(h) = G + C/h, and the nonzero eigenvalues mu of G^-1 C are -1/s for each
// natural frequency s. Only the columns where C is nonzero matter, so the
// eigenproblem is as small as the number of reactive unknowns.

import type { StepInfo } from "@cs/elements";
import { MnaSystem, SparseMnaSystem } from "./assembly";
import { VectorView, type Circuit } from "./circuit";
import { eigenvalues } from "./eigen";
import { DenseLU, SingularError, SPARSE_MIN_SIZE } from "./solver";
import { SparseLU } from "./sparse-lu";
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
/** Eigenvalues this far below the largest are rounding noise, not real fast modes. */
const REL_NOISE = 1e-9;

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
  if (n >= SPARSE_MIN_SIZE) return modes(sparseReduced(c, x, t));
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
  return modes({ K, k });
}

/** The same reduction as above with sparse storage and SparseLU, for large circuits. */
function sparseReduced(c: Circuit, x: Float64Array, t: number): { K: Float64Array; k: number } | null {
  const n = c.size;
  const sys = new SparseMnaSystem(n, c.nodeCount);
  stampStatic(c, sys);
  const view = new VectorView(x);
  const step = (dt: number): StepInfo => ({ kind: "transient", t, dt, method: "be", gmin: 1e-12, sourceScale: 1 });
  stampStep(c, sys, step(1), view, 0);
  const A1 = sys.values().slice();
  stampStep(c, sys, step(0.5), view, 0);
  const A2 = sys.values();
  const nnz = A2.length;
  const { rows, cols } = sys.pattern();
  const C = new Float64Array(nnz);
  const G = new Float64Array(nnz);
  for (let s = 0; s < nnz; s++) {
    const a1 = s < A1.length ? A1[s] : 0;
    C[s] = A2[s] - a1;
    G[s] = 2 * a1 - A2[s];
  }
  let scale = 1e-300;
  for (let s = 0; s < A1.length; s++) scale = Math.max(scale, Math.abs(A1[s]));
  for (let s = 0; s < nnz; s++) if (Math.abs(C[s]) <= 1e-13 * scale) C[s] = 0;
  // Node diagonals are the first nodeCount slots (SparseMnaSystem constructor).
  for (let u = 0; u < c.nodeCount; u++) G[u] += 1e-12;

  const colSlots: number[][] = Array.from({ length: n }, () => []);
  for (let s = 0; s < nnz; s++) if (C[s] !== 0) colSlots[cols![s]].push(s);
  const S: number[] = [];
  for (let j = 0; j < n; j++) if (colSlots[j].length > 0) S.push(j);
  if (S.length === 0) return null;

  const lu = new SparseLU();
  lu.analyze(sys.pattern());
  try {
    lu.factor(G);
  } catch (e) {
    if (e instanceof SingularError) return null;
    throw e;
  }
  const k = S.length;
  const K = new Float64Array(k * k);
  const col = new Float64Array(n);
  S.forEach((j, cj) => {
    col.fill(0);
    for (const s of colSlots[j]) col[rows![s]] = C[s];
    lu.solve(col);
    S.forEach((i, ci) => {
      K[ci * k + cj] = col[i];
    });
  });
  return { K, k };
}

/** Time scales from the eigenvalues mu of the reduced G^-1 C (s = -1/mu). */
function modes(reduced: { K: Float64Array; k: number } | null): number[] {
  if (!reduced) return [];
  const { K, k } = reduced;
  const eig = eigenvalues(K, k);
  if (!eig) return [];
  const out: number[] = [];
  let largest = 0;
  for (let i = 0; i < k; i++) largest = Math.max(largest, Math.sqrt(eig.re[i] * eig.re[i] + eig.im[i] * eig.im[i]));
  const floor = Math.max(MIN_TAU, REL_NOISE * largest);
  for (let i = 0; i < k; i++) {
    const re = eig.re[i];
    const im = eig.im[i];
    const mag2 = re * re + im * im;
    const mag = Math.sqrt(mag2);
    if (!(mag > floor)) continue;
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
