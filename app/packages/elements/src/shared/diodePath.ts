import type { NodeIndex } from "@cs/model";
import type { SolutionView, Stamper } from "../api";
import { Junction } from "./junction";
import { closeEnough } from "./linearize";

/** CircuitJS1's "default" diode model (DiodeModel.addDefaultModel): Is = 1.714e-7 A, n = 2. */
export const FALSTAD_DEFAULT_IS = 1.7143528192808883e-7;
export const FALSTAD_DEFAULT_N = 2;

/**
 * Saturation current of the diode CircuitJS1 builds from a forward drop
 * (DiodeModel.getModelWithParameters): 1 A at `fwdrop` with emission coefficient 2.
 */
export function saturationFromDrop(fwdrop: number, n = FALSTAD_DEFAULT_N, vt = 0.025865): number {
  return 1 / (Math.exp(fwdrop / (n * vt)) - 1);
}

/**
 * A Shockley diode between two unknowns (nodes, or internal nodes held in
 * branch unknowns), Newton-linearized with pnjlim like DiodeModel. Used inside
 * composite parts (thyristors, the diac, the unijunction transistor).
 */
export class DiodePath {
  readonly junction = new Junction();
  /** Junction voltage of the latest Newton stamp. */
  vIter = 0;

  constructor(is = FALSTAD_DEFAULT_IS, n = FALSTAD_DEFAULT_N) {
    this.junction.setParams(is, n);
  }

  stamp(s: Stamper, x: SolutionView, a: NodeIndex, k: NodeIndex, gmin: number): void {
    const v = this.junction.limit(x.x(a) - x.x(k), this.vIter);
    this.vIter = v;
    const gd = this.junction.conductance(v);
    s.conductance(a, k, gd + gmin);
    s.current(a, k, this.junction.current(v) - gd * v);
  }

  converged(x: SolutionView, a: NodeIndex, k: NodeIndex): boolean {
    return closeEnough(x.x(a) - x.x(k), this.vIter);
  }

  current(x: SolutionView, a: NodeIndex, k: NodeIndex, gmin = 0): number {
    const v = x.x(a) - x.x(k);
    return this.junction.current(v) + gmin * v;
  }

  accept(x: SolutionView, a: NodeIndex, k: NodeIndex): void {
    this.vIter = x.x(a) - x.x(k);
  }
}

/** Tiny conductance from an internal node to ground, so it is never left floating. */
export const INTERNAL_SHUNT = 1e-12;
