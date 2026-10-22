import type { ModelFactory, ReadoutSink, SetupContext, SolutionView, StepInfo, Stamper, UnknownIndex } from "../api";
import { DiodePath, INTERNAL_SHUNT } from "../shared/diodePath";
import { init, TwoTerminalModel } from "../shared/modelKit";
import { num, R_MIN, type Props } from "../shared/props";

/**
 * DiacElm (CircuitJS1): resistors r from terminal 0 to internal nodes n2 and
 * n3, a diode n2 -> terminal 1 and a diode terminal 1 -> n3, with r = on/off
 * resistance. As in startIteration(), the state follows the last accepted
 * step: off when |i| < holdingCurrent, then on when |v| > breakdown.
 */
class DiacModel extends TwoTerminalModel {
  readonly nonlinear = true;
  override stateSize = 3;
  private n2: UnknownIndex = 0;
  private n3: UnknownIndex = 0;
  private d1 = new DiodePath();
  private d2 = new DiodePath();
  private rOn = 500;
  private rOff = 1e8;
  private breakdown = 30;
  private hold = 0.01;
  private on = false;

  protected applyProps(p: Props): void {
    this.rOn = Math.max(R_MIN, num(p, "onResistance", 500));
    this.rOff = Math.max(R_MIN, num(p, "offResistance", 1e8));
    this.breakdown = Math.max(0, num(p, "breakdownVoltage", 30));
    this.hold = Math.max(0, num(p, "holdingCurrent", 0.01));
  }

  override setup(ctx: SetupContext): void {
    super.setup(ctx);
    this.n2 = ctx.allocBranch("n2");
    this.n3 = ctx.allocBranch("n3");
  }

  initialize(): void {
    this.on = false;
    this.d1.vIter = this.d2.vIter = 0;
  }

  private get r(): number {
    return this.on ? this.rOn : this.rOff;
  }

  stampStep(s: Stamper, _step: StepInfo): void {
    s.conductance(this.a, this.n2, 1 / this.r);
    s.conductance(this.a, this.n3, 1 / this.r);
    s.matrix(this.n2, this.n2, INTERNAL_SHUNT);
    s.matrix(this.n3, this.n3, INTERNAL_SHUNT);
  }

  stampNewton(s: Stamper, x: SolutionView, step: StepInfo): void {
    this.d1.stamp(s, x, this.n2, this.b, step.gmin);
    this.d2.stamp(s, x, this.b, this.n3, step.gmin);
  }

  hasConverged(x: SolutionView): boolean {
    return this.d1.converged(x, this.n2, this.b) && this.d2.converged(x, this.b, this.n3);
  }

  protected current(x: SolutionView): number {
    const va = x.v(this.a);
    return (va - x.x(this.n2)) / this.r + (va - x.x(this.n3)) / this.r;
  }

  override accept(x: SolutionView, step: StepInfo): void {
    this.d1.accept(x, this.n2, this.b);
    this.d2.accept(x, this.b, this.n3);
    if (step.kind === "ac") return;
    if (Math.abs(this.current(x)) < this.hold) this.on = false;
    if (Math.abs(this.voltage(x)) > this.breakdown) this.on = true;
  }

  override readouts(x: SolutionView, out: ReadoutSink): void {
    super.readouts(x, out);
    out.add("conducting", this.on ? 1 : 0);
  }

  override saveState(out: Float64Array): void {
    out[0] = this.on ? 1 : 0;
    out[1] = this.d1.vIter;
    out[2] = this.d2.vIter;
  }

  override loadState(from: Float64Array): void {
    this.on = (from[0] ?? 0) !== 0;
    this.d1.vIter = from[1] ?? 0;
    this.d2.vIter = from[2] ?? 0;
  }
}

export const diacModel: ModelFactory = (el) => init(new DiacModel(el), el);
