import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ComplexStamper, ElementModel, ModelFactory, ReadoutSink, SetupContext, SolutionView, StepInfo, Stamper, UnknownIndex } from "../api";
import { closeEnough } from "../shared/linearize";
import { exp } from "../shared/math";
import { init } from "../shared/modelKit";
import { num, type Props } from "../shared/props";

/** tanh from the deterministic exp (SIM-23). */
function tanh(u: number): number {
  if (u > 20) return 1;
  if (u < -20) return -1;
  return 1 - 2 / (exp(2 * u) + 1);
}

/** Output counts as saturated once it is this close (fraction of the half swing) to a rail. */
const SAT_FRACTION = 0.99;

/**
 * High-gain op-amp: an output voltage source to ground whose value is the
 * differential input times the open-loop gain, softly clamped to the rails:
 *   Vout = mid + half·tanh(A·(V+ - V-) / half),  mid/half from the rails
 * The tanh keeps the derivative continuous, so Newton handles both closed-loop
 * amplifiers (linear region, slope A) and comparators (flat tails). Inputs
 * draw no current. Output resistance is in series with the source.
 */
class OpAmpModel implements ElementModel {
  readonly nonlinear = true;
  readonly stateSize = 1;
  private n: NodeIndex[];
  private branch: UnknownIndex = 0;
  private gain = 1e5;
  private vmax = 15;
  private vmin = -15;
  private rOut = 0;
  private scale = 1;
  /** Linearization of the latest Newton stamp. */
  private vdIter = 0;
  private fIter = 0;
  private slopeIter = 0;
  private vdAcc = 0;

  constructor(el: NetlistElement) {
    this.n = [el.nodes[0] ?? 0, el.nodes[1] ?? 0, el.nodes[2] ?? 0];
  }

  setup(ctx: SetupContext): void {
    this.n = [ctx.nodes[0] ?? 0, ctx.nodes[1] ?? 0, ctx.nodes[2] ?? 0];
    this.branch = ctx.allocBranch("out");
  }

  setProps(p: Props): void {
    this.gain = Math.max(1e-3, num(p, "gain", 1e5));
    const a = num(p, "maxOutput", 15);
    const b = num(p, "minOutput", -15);
    this.vmax = Math.max(a, b);
    this.vmin = Math.min(a, b);
    this.rOut = Math.max(0, num(p, "outputResistance", 0));
  }

  initialize(): void {
    this.vdIter = this.vdAcc = 0;
  }

  private vd(x: SolutionView): number {
    return x.v(this.n[1]) - x.v(this.n[0]);
  }

  /** Output voltage and its slope at differential input vd. */
  private transfer(vd: number): [number, number] {
    const mid = 0.5 * (this.vmax + this.vmin) * this.scale;
    const half = Math.max(1e-9, 0.5 * (this.vmax - this.vmin) * this.scale);
    const t = tanh((this.gain * vd) / half);
    return [mid + half * t, this.gain * (1 - t * t)];
  }

  stampNewton(s: Stamper, x: SolutionView, step: StepInfo): void {
    const [minus, plus, out] = this.n;
    this.scale = step.kind === "ac" ? 1 : step.sourceScale;
    const vd = step.kind === "ac" ? this.vdAcc : this.vd(x);
    const [f, slope] = this.transfer(vd);
    // V(out) - slope·(V+ - V-) - R·i = f - slope·vd
    s.voltageSource(this.branch, out, 0, step.kind === "ac" ? 0 : f - slope * vd);
    s.matrix(this.branch, plus, -slope);
    s.matrix(this.branch, minus, slope);
    if (this.rOut > 0) s.matrix(this.branch, this.branch, -this.rOut);
    this.vdIter = vd;
    this.fIter = f;
    this.slopeIter = slope;
  }

  /** Small signal: V(out) - slope·(V+ - V-) - R·i = 0, slope from the operating point. */
  stampAC(s: ComplexStamper, op: SolutionView): void {
    const [minus, plus, out] = this.n;
    this.scale = 1;
    const [, slope] = this.transfer(this.vd(op));
    s.voltageSource(this.branch, out, 0, 0, 0);
    s.matrix(this.branch, plus, -slope, 0);
    s.matrix(this.branch, minus, slope, 0);
    if (this.rOut > 0) s.matrix(this.branch, this.branch, -this.rOut, 0);
  }

  /** Converged when the linearized output agrees with the true transfer at the new inputs. */
  hasConverged(x: SolutionView, _previous: SolutionView): boolean {
    const vd = this.vd(x);
    const [f] = this.transfer(vd);
    return closeEnough(f, this.fIter + this.slopeIter * (vd - this.vdIter));
  }

  accept(x: SolutionView, _step: StepInfo): void {
    this.vdAcc = this.vd(x);
  }

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    out[0] = 0;
    out[1] = 0;
    out[2] = x.x(this.branch);
  }

  readouts(x: SolutionView, out: ReadoutSink): void {
    const vo = x.v(this.n[2]);
    const half = 0.5 * (this.vmax - this.vmin);
    const mid = 0.5 * (this.vmax + this.vmin);
    out.add("vPlus", x.v(this.n[1]));
    out.add("vMinus", x.v(this.n[0]));
    out.add("vOut", vo);
    out.add("outputCurrent", -x.x(this.branch)); // delivered by the output
    out.add("saturated", Math.abs(vo - mid) >= SAT_FRACTION * half ? 1 : 0);
  }

  saveState(out: Float64Array): void {
    out[0] = this.vdAcc;
  }

  loadState(from: Float64Array): void {
    this.vdAcc = from[0] ?? 0;
    this.vdIter = this.vdAcc;
  }
}

export const opAmpModel: ModelFactory = (el) => init(new OpAmpModel(el), el);
