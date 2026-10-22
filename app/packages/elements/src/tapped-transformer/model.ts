// After CircuitJS1's TappedTransformerElm: three coupled windings (the
// primary and the two halves of the secondary).
// https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/client/TappedTransformerElm.java
//   L = | l1  m1  m1 |   l2 = l1·ratio²/4 (half the secondary turns),
//       | m1  l2  m2 |   m1 = k·√(l1·l2), m2 = k·l2
//       | m1  m2  l2 |
// Written in branch-current form like ../transformer (DC is a short across
// each winding): v_j = Σ r_jk·(i_k - i_k') [- v_j' for trap], r = L/dt or 2L/dt.

import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ComplexStamper, ElementModel, ModelFactory, ReadoutSink, SetupContext, SolutionView, StepInfo, Stamper, UnknownIndex } from "../api";
import { init } from "../shared/modelKit";
import { num, type Props } from "../shared/props";

/** Winding j runs from node WINDINGS[j][0] to WINDINGS[j][1] (terminal indexes). */
const WINDINGS: [number, number][] = [
  [0, 1],
  [2, 3],
  [3, 4],
];

class TappedTransformerModel implements ElementModel {
  readonly stateSize = 6; // i and v of each winding at the last accepted step
  private n: NodeIndex[];
  private br: UnknownIndex[] = [0, 0, 0];
  private L: number[][] = [];
  private i = [0, 0, 0];
  private v = [0, 0, 0];

  constructor(el: NetlistElement) {
    this.n = [0, 1, 2, 3, 4].map((k) => el.nodes[k] ?? 0);
  }

  setup(ctx: SetupContext): void {
    this.n = [0, 1, 2, 3, 4].map((k) => ctx.nodes[k] ?? 0);
    this.br = ["primary", "secondary1", "secondary2"].map((s) => ctx.allocBranch(s));
  }

  setProps(p: Props): void {
    const l1 = Math.max(1e-15, num(p, "inductance", 4));
    const ratio = Math.max(1e-6, Math.abs(num(p, "ratio", 1)));
    const k = Math.min(0.99999, Math.max(0, num(p, "coupling", 0.99)));
    const l2 = (l1 * ratio * ratio) / 4;
    const m1 = k * Math.sqrt(l1 * l2);
    const m2 = k * l2;
    this.L = [
      [l1, m1, m1],
      [m1, l2, m2],
      [m1, m2, l2],
    ];
  }

  initialize(): void {
    this.i = [0, 0, 0];
    this.v = [0, 0, 0];
  }

  private volt(x: SolutionView, j: number): number {
    const [a, b] = WINDINGS[j];
    return x.v(this.n[a]) - x.v(this.n[b]);
  }

  stampStep(s: Stamper, step: StepInfo): void {
    let f = 0;
    let trap = false;
    if (step.kind === "transient" && step.dt > 0) {
      trap = step.method === "trap";
      f = (trap ? 2 : 1) / step.dt;
    }
    for (let j = 0; j < 3; j++) {
      const [a, b] = WINDINGS[j];
      let veq = trap ? -this.v[j] : 0;
      for (let k = 0; k < 3; k++) {
        const r = f * this.L[j][k];
        veq -= r * this.i[k];
        if (r !== 0) s.matrix(this.br[j], this.br[k], -r);
      }
      s.voltageSource(this.br[j], this.n[a], this.n[b], veq);
    }
  }

  stampAC(s: ComplexStamper, _op: SolutionView, omega: number): void {
    for (let j = 0; j < 3; j++) {
      const [a, b] = WINDINGS[j];
      s.voltageSource(this.br[j], this.n[a], this.n[b], 0, 0);
      for (let k = 0; k < 3; k++) s.matrix(this.br[j], this.br[k], 0, -omega * this.L[j][k]);
    }
  }

  accept(x: SolutionView, _step: StepInfo): void {
    for (let j = 0; j < 3; j++) {
      this.i[j] = x.x(this.br[j]);
      this.v[j] = this.volt(x, j);
    }
  }

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    const [i1, i2, i3] = this.br.map((b) => x.x(b));
    out[0] = i1;
    out[1] = -i1;
    out[2] = i2;
    out[3] = i3 - i2;
    out[4] = -i3;
  }

  readouts(x: SolutionView, out: ReadoutSink): void {
    out.add("primaryVoltage", this.volt(x, 0));
    out.add("primaryCurrent", x.x(this.br[0]));
    out.add("secondaryVoltage", this.volt(x, 1) + this.volt(x, 2));
    out.add("tapCurrent", x.x(this.br[2]) - x.x(this.br[1]));
  }

  saveState(o: Float64Array): void {
    for (let j = 0; j < 3; j++) {
      o[j] = this.i[j];
      o[3 + j] = this.v[j];
    }
  }

  loadState(f: Float64Array): void {
    for (let j = 0; j < 3; j++) {
      this.i[j] = f[j] ?? 0;
      this.v[j] = f[3 + j] ?? 0;
    }
  }
}

export const tappedTransformerModel: ModelFactory = (el) => init(new TappedTransformerModel(el), el);
