import type { ModelFactory, ReadoutSink, SolutionView, StepInfo, Stamper } from "../api";
import { Junction } from "../shared/junction";
import { init, TwoTerminalModel } from "../shared/modelKit";
import { num, type Props } from "../shared/props";

const ABSTOL_V = 1e-6;
const RELTOL = 1e-3;

/**
 * Ideal Shockley diode (no series resistance), Newton-linearized at the
 * limited junction voltage vd: conductance gd + gmin in parallel with a
 * current source id - gd·vd, both from anode (0) to cathode (1).
 */
export class DiodeModel extends TwoTerminalModel {
  readonly nonlinear = true;
  override stateSize = 1;
  protected junction = new Junction();
  /** Junction voltage used for the latest Newton stamp. */
  private vIter = 0;
  /** Junction voltage of the last accepted solution (operating point for "ac"). */
  private vAcc = 0;
  private gmin = 0;

  protected applyProps(p: Props): void {
    this.junction.setParams(num(p, "saturationCurrent", 1e-14), num(p, "emissionCoefficient", 1));
  }

  initialize(): void {
    this.vIter = 0;
    this.vAcc = 0;
  }

  stampNewton(s: Stamper, x: SolutionView, step: StepInfo): void {
    this.gmin = step.gmin;
    if (step.kind === "ac") {
      s.conductance(this.a, this.b, this.junction.conductance(this.vAcc) + step.gmin);
      return;
    }
    const v = this.junction.limit(this.voltage(x), this.vIter);
    this.vIter = v;
    const id = this.junction.current(v);
    const gd = this.junction.conductance(v);
    s.conductance(this.a, this.b, gd + step.gmin);
    s.current(this.a, this.b, id - gd * v);
  }

  hasConverged(x: SolutionView, _previous: SolutionView): boolean {
    const v = this.voltage(x);
    return Math.abs(v - this.vIter) <= ABSTOL_V + RELTOL * Math.max(Math.abs(v), Math.abs(this.vIter));
  }

  override accept(x: SolutionView, _step: StepInfo): void {
    this.vAcc = this.voltage(x);
    this.vIter = this.vAcc;
  }

  protected current(x: SolutionView): number {
    const v = this.voltage(x);
    return this.junction.current(v) + this.gmin * v;
  }

  override readouts(x: SolutionView, out: ReadoutSink): void {
    super.readouts(x, out);
    out.add("forward", this.current(x) > 1e-6 ? 1 : 0);
  }

  override saveState(out: Float64Array): void {
    out[0] = this.vAcc;
  }

  override loadState(from: Float64Array): void {
    this.vAcc = from[0] ?? 0;
    this.vIter = this.vAcc;
  }
}

export const diodeModel: ModelFactory = (el) => init(new DiodeModel(el), el);
