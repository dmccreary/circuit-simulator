// After CircuitJS1's GyratorElm.stamp(): two voltage-controlled current sources.
// https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/client/GyratorElm.java

import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ComplexStamper, ElementModel, ModelFactory, ReadoutSink, SetupContext, SolutionView, StepInfo, Stamper } from "../api";
import { realPart } from "../shared/acStamp";
import { init } from "../shared/modelKit";
import { num, type Props } from "../shared/props";

/** Terminals 1+, 2+, 1-, 2- (GyratorElm post order). */
class GyratorModel implements ElementModel {
  readonly stateSize = 0;
  private n: NodeIndex[];
  private g = 1e-3;

  constructor(el: NetlistElement) {
    this.n = [0, 1, 2, 3].map((i) => el.nodes[i] ?? 0);
  }

  setup(ctx: SetupContext): void {
    this.n = [0, 1, 2, 3].map((i) => ctx.nodes[i] ?? 0);
  }

  setProps(p: Props): void {
    this.g = 1 / Math.max(1e-9, num(p, "resistance", 1000));
  }

  /** Current g·(V(cp) - V(cm)) into `into` (out of the circuit there) and out of `outOf`. */
  private vccs(s: Stamper, into: NodeIndex, outOf: NodeIndex, cp: NodeIndex, cm: NodeIndex, g: number): void {
    s.matrix(into, cp, g);
    s.matrix(into, cm, -g);
    s.matrix(outOf, cp, -g);
    s.matrix(outOf, cm, g);
  }

  stampStatic(s: Stamper): void {
    const [p1, p2, m1, m2] = this.n;
    this.vccs(s, p1, m1, p2, m2, this.g); // I1 = g·V2
    this.vccs(s, p2, m2, p1, m1, -this.g); // I2 = -g·V1
  }

  stampAC(s: ComplexStamper): void {
    this.stampStatic(realPart(s));
  }

  accept(_x: SolutionView, _step: StepInfo): void {}

  private ports(x: SolutionView): [number, number] {
    const [p1, p2, m1, m2] = this.n;
    return [x.v(p1) - x.v(m1), x.v(p2) - x.v(m2)];
  }

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    const [v1, v2] = this.ports(x);
    const i1 = this.g * v2;
    const i2 = -this.g * v1;
    out[0] = i1;
    out[1] = i2;
    out[2] = -i1;
    out[3] = -i2;
  }

  readouts(x: SolutionView, out: ReadoutSink): void {
    const [v1, v2] = this.ports(x);
    out.add("v1", v1);
    out.add("v2", v2);
    out.add("i1", this.g * v2);
    out.add("i2", -this.g * v1);
  }

  saveState(_out: Float64Array): void {}
  loadState(_from: Float64Array): void {}
}

export const gyratorModel: ModelFactory = (el) => init(new GyratorModel(el), el);
