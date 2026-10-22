import type { SolutionView, StepInfo } from "@cs/elements";
import type { Assembly } from "./assembly";
import type { Circuit } from "./circuit";

/** Conductance of a ground tie; any value works, since no current flows through it. */
const GROUND_TIE = 1;

export function stampStatic(c: Circuit, sys: Assembly): void {
  sys.beginStatic();
  for (const m of c.models) m?.stampStatic?.(sys);
  sys.endStatic();
}

/** Static + per-step stamps, Newton stamps at x (when given), and a node shunt. */
export function stampStep(c: Circuit, sys: Assembly, step: StepInfo, x: SolutionView | null, nodeShunt: number): void {
  sys.begin();
  for (const m of c.models) m?.stampStep?.(sys, step);
  c.digital?.stamp(sys);
  if (x && c.nonlinear) for (const m of c.models) if (m?.nonlinear) m.stampNewton?.(sys, x, step);
  sys.addNodeShunt(c.nodeCount, nodeShunt);
  for (const n of c.idleNodes) sys.matrix(n, n, 1e-12);
  if (c.groundTies) for (const n of c.groundTies) sys.matrix(n, n, GROUND_TIE);
}
