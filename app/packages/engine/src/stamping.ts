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

/**
 * Static + per-step stamps, Newton stamps at x (when given), and a node shunt.
 * With `anchor`, the shunt pulls each node toward its anchor voltage instead of
 * toward ground (pseudo-transient continuation, engine.ts).
 */
export function stampStep(
  c: Circuit,
  sys: Assembly,
  step: StepInfo,
  x: SolutionView | null,
  nodeShunt: number,
  anchor?: Float64Array,
): void {
  sys.begin();
  for (const m of c.models) m?.stampStep?.(sys, step);
  c.digital?.stamp(sys);
  if (x && c.nonlinear) for (const m of c.models) if (m?.nonlinear) m.stampNewton?.(sys, x, step);
  sys.addNodeShunt(c.nodeCount, nodeShunt + (c.leak ?? 0));
  if (anchor && nodeShunt > 0) for (let n = 1; n <= c.nodeCount; n++) sys.rhs(n, nodeShunt * anchor[n]);
  for (const n of c.idleNodes) sys.matrix(n, n, 1e-12);
  if (c.groundTies) for (const n of c.groundTies) sys.matrix(n, n, GROUND_TIE);
}
