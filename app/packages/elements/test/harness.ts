// A tiny dense MNA solver implementing the Stamper contract, for exercising models.
import { getModelFactory } from "@cs/elements/models";
import type { ElementModel, SolutionView, Stamper, StepInfo } from "@cs/elements";
import type { PropValue } from "@cs/model";

export class DenseStamper implements Stamper {
  A: number[][];
  b: number[];
  constructor(readonly size: number) {
    this.A = Array.from({ length: size }, () => new Array<number>(size).fill(0));
    this.b = new Array<number>(size).fill(0);
  }
  matrix(r: number, c: number, v: number): void {
    if (r !== 0 && c !== 0) this.A[r][c] += v;
  }
  rhs(r: number, v: number): void {
    if (r !== 0) this.b[r] += v;
  }
  conductance(a: number, b: number, g: number): void {
    this.matrix(a, a, g);
    this.matrix(b, b, g);
    this.matrix(a, b, -g);
    this.matrix(b, a, -g);
  }
  current(a: number, b: number, i: number): void {
    this.rhs(a, -i);
    this.rhs(b, i);
  }
  voltageSource(br: number, p: number, m: number, v: number): void {
    this.matrix(p, br, 1);
    this.matrix(m, br, -1);
    this.matrix(br, p, 1);
    this.matrix(br, m, -1);
    this.rhs(br, v);
  }
  /** Solve, skipping row/column 0 (ground). */
  solve(): number[] {
    const n = this.size - 1;
    const M = this.A.slice(1).map((row, i) => [...row.slice(1), this.b[i + 1]]);
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      [M[col], M[piv]] = [M[piv], M[col]];
      if (M[col][col] === 0) throw new Error("singular");
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = M[r][col] / M[col][col];
        for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k];
      }
    }
    return [0, ...M.map((row, i) => row[n] / row[i])];
  }
}

export function view(x: number[]): SolutionView {
  return { x: (i) => x[i] ?? 0, v: (i) => x[i] ?? 0 };
}

export interface Spec {
  type: string;
  nodes: number[];
  props?: Record<string, PropValue>;
  savedState?: number[];
}

/** Build models for a netlist, run setup, and offer DC / transient solves. */
export class Circuit {
  models: ElementModel[];
  size: number;
  x: number[];

  constructor(
    readonly nodeCount: number,
    specs: Spec[],
  ) {
    let next = nodeCount + 1;
    this.models = specs.map((s, i) => {
      const f = getModelFactory(s.type);
      if (!f) throw new Error(`no model for ${s.type}`);
      const m = f({ id: `e${i}`, type: s.type, nodes: s.nodes, props: s.props ?? {}, savedState: s.savedState });
      m.setup({ nodes: s.nodes, allocBranch: () => next++ });
      return m;
    });
    this.size = next;
    this.x = new Array<number>(next).fill(0);
  }

  solve(step: StepInfo, maxIter = 100): number[] {
    let x = this.x;
    for (let iter = 0; iter < maxIter; iter++) {
      const s = new DenseStamper(this.size);
      for (const m of this.models) {
        m.stampStatic?.(s);
        m.stampStep?.(s, step);
        m.stampNewton?.(s, view(x), step);
      }
      const nx = s.solve();
      const nonlinear = this.models.filter((m) => m.nonlinear);
      if (nonlinear.length === 0 || nonlinear.every((m) => m.hasConverged?.(view(nx), view(x)) ?? true)) {
        return nx;
      }
      x = nx;
    }
    throw new Error("no convergence");
  }

  step(step: StepInfo): number[] {
    const x = this.solve(step);
    for (const m of this.models) m.accept(view(x), step);
    this.x = x;
    return x;
  }
}

export const dcStep: StepInfo = { kind: "dc", t: 0, dt: 0, method: "be", gmin: 1e-12, sourceScale: 1 };
export const tran = (t: number, dt: number, method: "be" | "trap" = "trap"): StepInfo => ({
  kind: "transient",
  t,
  dt,
  method,
  gmin: 1e-12,
  sourceScale: 1,
});

export function readoutsOf(m: ElementModel, x: number[]): Record<string, number> {
  const out: Record<string, number> = {};
  m.readouts(view(x), { add: (k, v) => (out[k] = v) });
  return out;
}

export function currentsOf(m: ElementModel, x: number[], n: number): number[] {
  const out = new Float64Array(n);
  m.terminalCurrents(view(x), out);
  return [...out];
}
