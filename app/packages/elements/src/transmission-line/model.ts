// Lossless line by the method of characteristics (Branin), the scheme of
// CircuitJS1's TransLineElm. Each end is a source behind the line impedance:
//   V(A+) - V(A-) - Z0·iA = vB(t - T) + Z0·iB(t - T)
//   V(B+) - V(B-) - Z0·iB = vA(t - T) + Z0·iA(t - T)
// (i = current into the "+" terminal of that end). Steps are capped at the
// delay T so the delayed values always come from accepted history. The two
// return terminals are one shield conductor (R_SHIELD): CircuitJS1 requires
// both to sit at ground, and joining them keeps a lone far end solvable.
// https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/client/TransLineElm.java

import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ElementModel, ModelFactory, ReadoutSink, SetupContext, SolutionView, Stamper, StepInfo, UnknownIndex } from "../api";
import { init } from "../shared/modelKit";
import { num, type Props } from "../shared/props";

const R_SHIELD = 1e-3;

class TransmissionLineModel implements ElementModel {
  readonly stateSize = 0;
  private n: NodeIndex[];
  private brA: UnknownIndex = 0;
  private brB: UnknownIndex = 0;
  private delay = 1e-8;
  private z0 = 75;
  /** Accepted history: time, then the wave each end sends toward the other. */
  private times: number[] = [];
  private toB: number[] = [];
  private toA: number[] = [];

  constructor(el: NetlistElement) {
    this.n = el.nodes.slice();
  }

  setup(ctx: SetupContext): void {
    this.n = ctx.nodes.slice();
    this.brA = ctx.allocBranch("a");
    this.brB = ctx.allocBranch("b");
  }

  setProps(p: Props): void {
    this.delay = Math.max(1e-15, num(p, "delay", 1e-8));
    this.z0 = Math.max(1e-6, num(p, "impedance", 75));
  }

  initialize(): void {
    this.times = [];
    this.toB = [];
    this.toA = [];
  }

  /** Linear interpolation in the history at time t (0 before it starts). */
  private at(series: number[], t: number): number {
    const ts = this.times;
    if (!ts.length || t < ts[0]) return 0;
    let lo = 0;
    let hi = ts.length - 1;
    if (t >= ts[hi]) return series[hi];
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (ts[mid] <= t) lo = mid;
      else hi = mid;
    }
    const f = (t - ts[lo]) / (ts[hi] - ts[lo] || 1);
    return series[lo] + f * (series[hi] - series[lo]);
  }

  stampStatic(s: Stamper): void {
    s.conductance(this.n[2], this.n[3], 1 / R_SHIELD);
  }

  stampStep(s: Stamper, step: StepInfo): void {
    const t = step.kind === "transient" ? step.t - this.delay : -1;
    const [ap, bp, am, bm] = this.n;
    s.voltageSource(this.brA, ap, am, this.at(this.toA, t));
    s.matrix(this.brA, this.brA, -this.z0);
    s.voltageSource(this.brB, bp, bm, this.at(this.toB, t));
    s.matrix(this.brB, this.brB, -this.z0);
  }

  accept(x: SolutionView, step: StepInfo): void {
    if (step.kind !== "transient") return;
    const [ap, bp, am, bm] = this.n;
    const vA = x.v(ap) - x.v(am);
    const vB = x.v(bp) - x.v(bm);
    this.times.push(step.t);
    this.toB.push(vA + this.z0 * x.x(this.brA));
    this.toA.push(vB + this.z0 * x.x(this.brB));
    // Keep a little more than one delay of history.
    let drop = 0;
    while (drop + 2 < this.times.length && this.times[drop + 1] < step.t - 1.5 * this.delay) drop++;
    if (drop > 0) {
      this.times.splice(0, drop);
      this.toB.splice(0, drop);
      this.toA.splice(0, drop);
    }
  }

  breakpoints(t0: number, t1: number, out: number[]): void {
    if (t0 + this.delay <= t1) out.push(t0 + this.delay);
  }

  readouts(x: SolutionView, out: ReadoutSink): void {
    const [ap, bp, am, bm] = this.n;
    out.add("voltageA", x.v(ap) - x.v(am));
    out.add("voltageB", x.v(bp) - x.v(bm));
    out.add("currentA", x.x(this.brA));
    out.add("currentB", x.x(this.brB));
  }

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    const ia = x.x(this.brA);
    const ib = x.x(this.brB);
    out[0] = ia;
    out[1] = ib;
    const iShield = (x.v(this.n[2]) - x.v(this.n[3])) / R_SHIELD;
    out[2] = -ia + iShield;
    out[3] = -ib - iShield;
  }

  saveState(): void {}
  loadState(): void {}
}

export const transmissionLineModel: ModelFactory = (el) => init(new TransmissionLineModel(el), el);
