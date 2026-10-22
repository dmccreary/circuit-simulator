// DC operating point for analyses (simulation-engine.md §8): capacitors open,
// inductors shorted, Newton–Raphson with gmin stepping then source stepping.
// Same algorithm as the live engine's, on the analysis service's own dense
// solver so the two can evolve independently.

import type { StepInfo } from "@cs/elements";
import type { Netlist } from "@cs/model";
import { buildCircuit, VectorView, type Circuit, type FactoryLookup } from "../circuit";
import { solveReal } from "./lu";
import { RealSystem } from "./systems";

export const GMIN = 1e-12;
const RELTOL = 1e-3;
const VNTOL = 1e-6;
const ABSTOL = 1e-12;
const MAX_ITER = 100;

export interface OperatingPoint {
  circuit: Circuit;
  /** Solution indexed by unknown (x[0] = ground = 0); null when no DC solution was found. */
  x: Float64Array | null;
  error?: string;
}

const dcStep = (gmin: number, sourceScale: number): StepInfo => ({ kind: "dc", t: 0, dt: 0, method: "be", gmin, sourceScale });

function allFinite(x: Float64Array): boolean {
  for (let i = 0; i < x.length; i++) if (!Number.isFinite(x[i])) return false;
  return true;
}

function converged(c: Circuit, xn: Float64Array, xo: Float64Array): boolean {
  for (let i = 1; i < xn.length; i++) {
    const tol = RELTOL * Math.max(Math.abs(xn[i]), Math.abs(xo[i])) + (i <= c.nodeCount ? VNTOL : ABSTOL);
    if (Math.abs(xn[i] - xo[i]) > tol) return false;
  }
  const vn = new VectorView(xn);
  const vo = new VectorView(xo);
  for (const m of c.models) if (m?.nonlinear && m.hasConverged && !m.hasConverged(vn, vo)) return false;
  return true;
}

/** Assemble static + step + Newton stamps at x and solve once. */
function linearized(c: Circuit, sys: RealSystem, step: StepInfo, x: Float64Array | null): Float64Array | null {
  sys.clear();
  for (const m of c.models) m?.stampStatic?.(sys);
  for (const m of c.models) m?.stampStep?.(sys, step);
  if (x && c.nonlinear) {
    const v = new VectorView(x);
    for (const m of c.models) if (m?.nonlinear) m.stampNewton?.(sys, v, step);
  }
  for (let u = 1; u <= c.nodeCount; u++) sys.matrix(u, u, step.gmin);
  for (const n of c.idleNodes) sys.matrix(n, n, 1e-12);
  const rhs = Float64Array.from(sys.b);
  try {
    if (c.size > 0) solveReal(Float64Array.from(sys.A), rhs, c.size);
  } catch {
    return null;
  }
  const out = new Float64Array(c.size + 1);
  out.set(rhs, 1);
  return allFinite(out) ? out : null;
}

function solveAt(c: Circuit, sys: RealSystem, step: StepInfo, guess: Float64Array): Float64Array | null {
  if (!c.nonlinear) return linearized(c, sys, step, null);
  let xg = guess;
  for (let i = 0; i < MAX_ITER; i++) {
    const xn = linearized(c, sys, step, xg);
    if (!xn) return null;
    if (converged(c, xn, xg)) return xn;
    xg = xn;
  }
  return null;
}

/** Solve an already-built circuit's DC point. `guess` (e.g. the previous sweep point) speeds convergence. */
export function solveDc(c: Circuit, guess?: Float64Array | null): Float64Array | null {
  const sys = new RealSystem(c.size);
  const zero = new Float64Array(c.size + 1);
  const at = (gmin: number, scale: number, g: Float64Array) => solveAt(c, sys, dcStep(gmin, scale), g);

  if (guess && guess.length === zero.length) {
    const x = at(GMIN, 1, guess);
    if (x) return x;
  }
  let x = at(GMIN, 1, zero);
  if (x) return x;

  let g = 1e-2;
  x = zero;
  while (x && g > GMIN) {
    x = at(g, 1, x);
    g /= 10;
  }
  if (x) {
    x = at(GMIN, 1, x);
    if (x) return x;
  }

  x = at(GMIN, 0, zero);
  let scale = 0;
  let ds = 0.1;
  while (x && scale < 1) {
    const next = Math.min(1, scale + ds);
    const xr = at(GMIN, next, x);
    if (xr) {
      x = xr;
      scale = next;
      ds = Math.min(ds * 2, 0.5);
    } else {
      ds /= 4;
      if (ds < 1e-6) return null;
    }
  }
  return x;
}

/** Build the circuit, solve its DC operating point, and accept it into every model. */
export function operatingPoint(netlist: Netlist, lookup: FactoryLookup, guess?: Float64Array | null): OperatingPoint {
  const circuit = buildCircuit(netlist, lookup);
  const x = solveDc(circuit, guess);
  if (!x) return { circuit, x: null, error: "no-dc-solution" };
  const v = new VectorView(x);
  const step = dcStep(GMIN, 1);
  for (const m of circuit.models) m?.accept(v, step);
  return { circuit, x };
}
