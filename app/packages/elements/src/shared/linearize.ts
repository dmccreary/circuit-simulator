import type { NodeIndex } from "@cs/model";
import type { Stamper } from "../api";

/** A controlling voltage V(plus) - V(minus). */
export interface ControlPair {
  plus: NodeIndex;
  minus: NodeIndex;
}

/**
 * Newton stamp for a multi-terminal non-linear part whose terminal currents
 * depend on a few controlling voltages. Linearized at c0:
 *   I_k(c) ≈ i0[k] + Σ_m g[k][m]·(c_m - c0[m])
 * where I_k is the current INTO terminal k from its node. With `matrixOnly`
 * (small-signal "ac") only the conductances are stamped.
 */
export function stampLinearized(
  s: Stamper,
  terminals: readonly NodeIndex[],
  controls: readonly ControlPair[],
  c0: readonly number[],
  i0: readonly number[],
  g: readonly (readonly number[])[],
  matrixOnly = false,
): void {
  terminals.forEach((node, k) => {
    let ieq = i0[k];
    controls.forEach((c, m) => {
      const gkm = g[k][m];
      if (gkm === 0) return;
      ieq -= gkm * c0[m];
      s.matrix(node, c.plus, gkm);
      s.matrix(node, c.minus, -gkm);
    });
    if (!matrixOnly) s.rhs(node, -ieq);
  });
}

/** Simple step limiter for smooth (non-exponential) controlling voltages. */
export function limitStep(vnew: number, vold: number, maxStep: number): number {
  if (vnew > vold + maxStep) return vold + maxStep;
  if (vnew < vold - maxStep) return vold - maxStep;
  return vnew;
}

export const ABSTOL_V = 1e-6;
export const RELTOL = 1e-3;

export function closeEnough(a: number, b: number): boolean {
  return Math.abs(a - b) <= ABSTOL_V + RELTOL * Math.max(Math.abs(a), Math.abs(b));
}
