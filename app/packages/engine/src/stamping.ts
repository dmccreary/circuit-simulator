import type { SolutionView, StepInfo } from "@cs/elements";
import type { MnaSystem } from "./assembly";
import type { Circuit } from "./circuit";

export function stampStatic(c: Circuit, sys: MnaSystem): void {
  sys.beginStatic();
  for (const m of c.models) m?.stampStatic?.(sys);
  sys.endStatic();
}

/** Static + per-step stamps, Newton stamps at x (when given), and a node shunt. */
export function stampStep(c: Circuit, sys: MnaSystem, step: StepInfo, x: SolutionView | null, nodeShunt: number): void {
  sys.begin();
  for (const m of c.models) m?.stampStep?.(sys, step);
  if (x && c.nonlinear) for (const m of c.models) if (m?.nonlinear) m.stampNewton?.(sys, x, step);
  sys.addNodeShunt(c.nodeCount, nodeShunt);
  for (const n of c.idleNodes) sys.matrix(n, n, 1e-12);
}
