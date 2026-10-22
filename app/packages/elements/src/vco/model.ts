// After CircuitJS1's VCOElm (stamp, doStep):
// https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/client/VCOElm.java
//   V(R1) = V(Vi), V(R2) = 5 V, V(Vo) = 0 or 5 V (sources); a 1 MΩ resistor
//   across C1-C2; the R1 and R2 source currents (which leave R1 and R2 into
//   the circuit) pass through the capacitor, from C2 to C1 while charging
//   (Vo low) and the other way while discharging (Vo high).
// CircuitJS1 decides the direction inside each iteration; here it is decided
// when a step is accepted, and a breakpoint lands the step on the threshold
// crossing predicted from the capacitor voltage's slope.

import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ElementModel, ModelFactory, ReadoutSink, SetupContext, SolutionView, Stamper, StepInfo, UnknownIndex } from "../api";
import { init } from "../shared/modelKit";

const R_CAP = 1e6;
const V_HIGH = 5;
const TOP = 4.5;
const BOTTOM = 0.5;
/** Crossing tolerance, volts: a step that lands this close to a threshold flips the output. */
const SLACK = 1e-3;

class VcoModel implements ElementModel {
  readonly stateSize = 4;
  private n: NodeIndex[];
  private bOut: UnknownIndex = 0;
  private b1: UnknownIndex = 0;
  private b2: UnknownIndex = 0;
  /** Output high (discharging) or low (charging). */
  private high = false;
  private vc = 0;
  private vcPrev = 0;
  private tPrev = 0;
  private tLast = 0;

  constructor(el: NetlistElement) {
    this.n = [0, 1, 2, 3, 4, 5].map((k) => el.nodes[k] ?? 0);
  }

  setup(ctx: SetupContext): void {
    this.n = [0, 1, 2, 3, 4, 5].map((k) => ctx.nodes[k] ?? 0);
    this.bOut = ctx.allocBranch("out");
    this.b1 = ctx.allocBranch("r1");
    this.b2 = ctx.allocBranch("r2");
  }

  setProps(): void {}

  initialize(): void {
    this.high = false;
    this.vc = this.vcPrev = this.tPrev = this.tLast = 0;
  }

  stampStep(s: Stamper, step: StepInfo): void {
    const [vi, vo, c1, c2, r1, r2] = this.n;
    s.voltageSource(this.bOut, vo, 0, (this.high ? V_HIGH : 0) * step.sourceScale);
    s.voltageSource(this.b1, r1, vi, 0);
    s.voltageSource(this.b2, r2, 0, V_HIGH * step.sourceScale);
    s.conductance(c1, c2, 1 / R_CAP);
    // The source currents leaving R1 and R2 are -x[b1] and -x[b2]; dir·(that) leaves C1 into the part.
    const dir = this.high ? -1 : 1;
    for (const b of [this.b1, this.b2]) {
      s.matrix(c1, b, -dir);
      s.matrix(c2, b, dir);
    }
  }

  private capVoltage(x: SolutionView): number {
    return x.v(this.n[3]) - x.v(this.n[2]);
  }

  accept(x: SolutionView, step: StepInfo): void {
    const vc = this.capVoltage(x);
    if (step.kind === "transient" && step.dt > 0) {
      this.vcPrev = this.vc;
      this.tPrev = this.tLast;
    } else this.vcPrev = vc;
    this.vc = vc;
    this.tLast = step.t;
    if (!this.high && vc > TOP - SLACK) this.high = true;
    else if (this.high && vc < BOTTOM + SLACK) this.high = false;
  }

  /** The predicted time the capacitor voltage reaches the active threshold. */
  breakpoints(t0: number, t1: number, out: number[]): void {
    const dt = this.tLast - this.tPrev;
    if (!(dt > 0)) return;
    const slope = (this.vc - this.vcPrev) / dt;
    const target = this.high ? BOTTOM : TOP;
    if (this.high ? slope >= 0 : slope <= 0) return;
    const at = this.tLast + (target - this.vc) / slope;
    if (at > t0 && at <= t1) out.push(at);
  }

  readouts(x: SolutionView, out: ReadoutSink): void {
    out.add("vOut", x.v(this.n[1]));
    out.add("vCap", this.capVoltage(x));
  }

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    const i1 = x.x(this.b1);
    const i2 = x.x(this.b2);
    const dir = this.high ? -1 : 1;
    const ic = -dir * (i1 + i2) + (x.v(this.n[2]) - x.v(this.n[3])) / R_CAP;
    out[0] = -i1; // Vi feeds the R1 source
    out[1] = x.x(this.bOut);
    out[2] = ic;
    out[3] = -ic;
    out[4] = i1;
    out[5] = i2;
  }

  saveState(o: Float64Array): void {
    o[0] = this.high ? 1 : 0;
    o[1] = this.vc;
    o[2] = this.vcPrev;
    o[3] = this.tLast - this.tPrev;
  }

  loadState(f: Float64Array): void {
    this.high = f[0] === 1;
    this.vc = f[1] ?? 0;
    this.vcPrev = f[2] ?? 0;
    this.tLast = 0;
    this.tPrev = -(f[3] ?? 0);
  }
}

export const vcoModel: ModelFactory = (el) => init(new VcoModel(el), el);
