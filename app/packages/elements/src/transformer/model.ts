import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ElementModel, ModelFactory, ReadoutSink, SetupContext, SolutionView, StepInfo, Stamper, UnknownIndex } from "../api";
import { init } from "../shared/modelKit";
import { bool, num, type Props } from "../shared/props";

/**
 * Two coupled inductors in branch-current form (dual of a pair of inductors),
 * so DC is an exact short across each winding:
 *   v1 = L1·di1/dt + M·di2/dt,   v2 = M·di1/dt + L2·di2/dt,   M = ±k·√(L1·L2)
 *   BE:   v_j = (r_j1·(i1 - i1') + r_j2·(i2 - i2'))      with r = L/dt
 *   trap: v_j = (r_j1·(i1 - i1') + r_j2·(i2 - i2')) - v_j'  with r = 2L/dt
 * Branch currents flow into P+ and S+. k = 1 is allowed (nothing is inverted).
 */
class TransformerModel implements ElementModel {
  readonly stateSize = 4; // i1, i2, v1, v2 of the last accepted step
  private n: NodeIndex[];
  private b1: UnknownIndex = 0;
  private b2: UnknownIndex = 0;
  private l1 = 4;
  private l2 = 4;
  private m = 0;
  private ratio = 1;
  private i1 = 0;
  private i2 = 0;
  private v1 = 0;
  private v2 = 0;

  constructor(el: NetlistElement) {
    this.n = [0, 1, 2, 3].map((i) => el.nodes[i] ?? 0);
  }

  setup(ctx: SetupContext): void {
    this.n = [0, 1, 2, 3].map((i) => ctx.nodes[i] ?? 0);
    this.b1 = ctx.allocBranch("primary");
    this.b2 = ctx.allocBranch("secondary");
  }

  setProps(p: Props): void {
    this.l1 = Math.max(1e-15, num(p, "inductance", 4));
    this.ratio = Math.max(1e-6, Math.abs(num(p, "ratio", 1)));
    this.l2 = this.l1 * this.ratio * this.ratio;
    const k = Math.min(1, Math.max(0, num(p, "coupling", 0.999)));
    this.m = (bool(p, "reversePolarity", false) ? -1 : 1) * k * Math.sqrt(this.l1 * this.l2);
  }

  initialize(): void {
    this.i1 = this.i2 = this.v1 = this.v2 = 0;
  }

  stampStep(s: Stamper, step: StepInfo): void {
    const [p1, m1, p2, m2] = this.n;
    let f = 0;
    let trap = false;
    if (step.kind === "transient" && step.dt > 0) {
      trap = step.method === "trap";
      f = (trap ? 2 : 1) / step.dt;
    }
    const r11 = f * this.l1;
    const r12 = f * this.m;
    const r22 = f * this.l2;
    // V(+) - V(-) - r·i = veq
    const veq1 = -r11 * this.i1 - r12 * this.i2 - (trap ? this.v1 : 0);
    const veq2 = -r12 * this.i1 - r22 * this.i2 - (trap ? this.v2 : 0);
    s.voltageSource(this.b1, p1, m1, veq1);
    s.voltageSource(this.b2, p2, m2, veq2);
    if (f !== 0) {
      s.matrix(this.b1, this.b1, -r11);
      s.matrix(this.b1, this.b2, -r12);
      s.matrix(this.b2, this.b1, -r12);
      s.matrix(this.b2, this.b2, -r22);
    }
  }

  accept(x: SolutionView, _step: StepInfo): void {
    const [p1, m1, p2, m2] = this.n;
    this.i1 = x.x(this.b1);
    this.i2 = x.x(this.b2);
    this.v1 = x.v(p1) - x.v(m1);
    this.v2 = x.v(p2) - x.v(m2);
  }

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    const i1 = x.x(this.b1);
    const i2 = x.x(this.b2);
    out[0] = i1;
    out[1] = -i1;
    out[2] = i2;
    out[3] = -i2;
  }

  readouts(x: SolutionView, out: ReadoutSink): void {
    const [p1, m1, p2, m2] = this.n;
    const v1 = x.v(p1) - x.v(m1);
    const v2 = x.v(p2) - x.v(m2);
    const i1 = x.x(this.b1);
    const i2 = x.x(this.b2);
    out.add("primaryVoltage", v1);
    out.add("primaryCurrent", i1);
    out.add("secondaryVoltage", v2);
    out.add("secondaryCurrent", -i2); // delivered by the secondary
    out.add("ratio", this.ratio);
    out.add("powerIn", v1 * i1);
    out.add("powerOut", -v2 * i2);
  }

  saveState(out: Float64Array): void {
    out[0] = this.i1;
    out[1] = this.i2;
    out[2] = this.v1;
    out[3] = this.v2;
  }

  loadState(from: Float64Array): void {
    this.i1 = from[0] ?? 0;
    this.i2 = from[1] ?? 0;
    this.v1 = from[2] ?? 0;
    this.v2 = from[3] ?? 0;
  }
}

export const transformerModel: ModelFactory = (el) => init(new TransformerModel(el), el);
