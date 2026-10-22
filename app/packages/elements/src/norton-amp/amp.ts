// The Norton amp's output stage: NortonAmpElm's inner OpAmpElm ("-" = the
// "-" input, "+" = ground, 0..maxOutput V), with the soft tanh clamp of
// ../op-amp but with Newton limiting on the normalized drive u = A·vd/half
// (like a junction's pnjlim). Norton amps are mostly used as comparators with
// positive feedback, where the plain high-gain linearization overshoots the
// rails on every iteration and Newton cycles. In transient analysis the
// output also lags the static transfer by a 1 µs first-order pole
// (backward Euler), so a regenerative switch is a fast but continuous
// transition the step control can follow instead of a jump with no solution.

import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ComplexStamper, ElementModel, ModelFactory, ReadoutSink, SetupContext, SolutionView, StepInfo, Stamper, UnknownIndex } from "../api";
import { closeEnough } from "../shared/linearize";
import { exp } from "../shared/math";
import { init } from "../shared/modelKit";
import { num, type Props } from "../shared/props";

function tanh(u: number): number {
  if (u > 20) return 1;
  if (u < -20) return -1;
  return 1 - 2 / (exp(2 * u) + 1);
}

/** Largest change of u in one iteration inside the linear region, and that region's half-width. */
const DU = 2;
const LINEAR = 5;
/** Output pole time constant, seconds. */
const TAU = 1e-6;

/** Terminals: "-", "+", out (as ../op-amp). */
class LimitedAmpModel implements ElementModel {
  readonly nonlinear = true;
  readonly stateSize = 2;
  private n: NodeIndex[];
  private branch: UnknownIndex = 0;
  private gain = 1e5;
  private vmax = 12;
  private scale = 1;
  private uIter = 0;
  private uAcc = 0;
  private voAcc = 0;

  constructor(el: NetlistElement) {
    this.n = [0, 1, 2].map((k) => el.nodes[k] ?? 0);
  }

  setup(ctx: SetupContext): void {
    this.n = [0, 1, 2].map((k) => ctx.nodes[k] ?? 0);
    this.branch = ctx.allocBranch("out");
  }

  setProps(p: Props): void {
    this.gain = Math.max(1e-3, num(p, "gain", 1e5));
    this.vmax = Math.max(1e-3, num(p, "maxOutput", 12));
  }

  initialize(): void {
    this.uIter = this.uAcc = this.voAcc = 0;
  }

  private get half(): number {
    return Math.max(1e-9, 0.5 * this.vmax * this.scale);
  }

  private u(x: SolutionView): number {
    return (this.gain * (x.v(this.n[1]) - x.v(this.n[0]))) / this.half;
  }

  private limit(u: number, old: number): number {
    if (Math.abs(old) <= LINEAR) return Math.min(old + DU, Math.max(old - DU, u));
    if (Math.sign(u) !== Math.sign(old) || Math.abs(u) < LINEAR) return Math.min(LINEAR, Math.max(-LINEAR, u));
    return u;
  }

  /**
   * V(out) = a·half·(1 + tanh(u)) + (1 - a)·Vout' linearized at u (slope in volts
   * per volt of vd); a = dt/(dt + TAU) in transient, 1 otherwise.
   */
  private stampAt(s: Stamper, u: number, withRhs: boolean, a = 1): void {
    const [minus, plus, out] = this.n;
    const h = this.half;
    const t = tanh(u);
    const slope = a * this.gain * (1 - t * t);
    const vd = (u * h) / this.gain;
    s.voltageSource(this.branch, out, 0, withRhs ? a * h * (1 + t) - slope * vd + (1 - a) * this.voAcc : 0);
    s.matrix(this.branch, plus, -slope);
    s.matrix(this.branch, minus, slope);
  }

  stampNewton(s: Stamper, x: SolutionView, step: StepInfo): void {
    if (step.kind === "ac") {
      this.stampAt(s, this.uAcc, false);
      return;
    }
    this.scale = step.sourceScale;
    this.uIter = this.limit(this.u(x), this.uIter);
    const a = step.kind === "transient" && step.dt > 0 ? step.dt / (step.dt + TAU) : 1;
    this.stampAt(s, this.uIter, true, a);
  }

  stampAC(s: ComplexStamper, op: SolutionView): void {
    const [minus, plus, out] = this.n;
    const t = tanh(this.u(op));
    const slope = this.gain * (1 - t * t);
    s.voltageSource(this.branch, out, 0, 0, 0);
    s.matrix(this.branch, plus, -slope, 0);
    s.matrix(this.branch, minus, slope, 0);
  }

  hasConverged(x: SolutionView): boolean {
    const h = this.half;
    return closeEnough(h * (1 + tanh(this.u(x))), h * (1 + tanh(this.uIter))) && Math.abs(this.u(x) - this.uIter) < LINEAR;
  }

  accept(x: SolutionView, _step: StepInfo): void {
    this.uAcc = this.uIter = this.u(x);
    this.voAcc = x.v(this.n[2]);
  }

  readouts(_x: SolutionView, _out: ReadoutSink): void {}

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    out[0] = 0;
    out[1] = 0;
    out[2] = x.x(this.branch);
  }

  saveState(o: Float64Array): void {
    o[0] = this.uAcc;
    o[1] = this.voAcc;
  }

  loadState(f: Float64Array): void {
    this.uAcc = this.uIter = f[0] ?? 0;
    this.voAcc = f[1] ?? 0;
  }
}

export const limitedAmpModel: ModelFactory = (el) => init(new LimitedAmpModel(el), el);
