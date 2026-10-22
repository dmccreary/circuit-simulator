import type { ModelFactory, ReadoutSink, SolutionView, StepInfo, Stamper } from "../api";
import { init, TwoTerminalModel } from "../shared/modelKit";
import { num, R_MIN, type Props } from "../shared/props";

/**
 * SparkGapElm: a resistor whose value is chosen at the start of each step
 * (startIteration) from the last accepted solution, so each step is linear:
 * it stops conducting when |i| < holdingCurrent and fires when |v| > breakdown.
 */
class SparkGapModel extends TwoTerminalModel {
  override stateSize = 1;
  private rOn = 1000;
  private rOff = 1e9;
  private breakdown = 1000;
  private hold = 0.001;
  private on = false;

  protected applyProps(p: Props): void {
    this.rOn = Math.max(R_MIN, num(p, "onResistance", 1000));
    this.rOff = Math.max(R_MIN, num(p, "offResistance", 1e9));
    this.breakdown = Math.max(0, num(p, "breakdownVoltage", 1000));
    this.hold = Math.max(0, num(p, "holdingCurrent", 0.001));
  }

  initialize(): void {
    this.on = false;
  }

  private resistance(): number {
    return this.on ? this.rOn : this.rOff;
  }

  stampStep(s: Stamper, _step: StepInfo): void {
    s.conductance(this.a, this.b, 1 / this.resistance());
  }

  override accept(x: SolutionView, step: StepInfo): void {
    if (step.kind !== "transient") return;
    const v = this.voltage(x);
    if (Math.abs(v / this.resistance()) < this.hold) this.on = false;
    if (Math.abs(v) > this.breakdown) this.on = true;
  }

  protected current(x: SolutionView): number {
    return this.voltage(x) / this.resistance();
  }

  override readouts(x: SolutionView, out: ReadoutSink): void {
    super.readouts(x, out);
    out.add("conducting", this.on ? 1 : 0);
  }

  override saveState(out: Float64Array): void {
    out[0] = this.on ? 1 : 0;
  }

  override loadState(from: Float64Array): void {
    this.on = (from[0] ?? 0) !== 0;
  }
}

export const sparkGapModel: ModelFactory = (el) => init(new SparkGapModel(el), el);
