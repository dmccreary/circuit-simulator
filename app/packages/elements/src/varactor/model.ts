import type { ComplexStamper, ModelFactory, ReadoutSink, SolutionView, StepInfo, Stamper } from "../api";
import { saturationFromDrop } from "../shared/diodePath";
import { Junction } from "../shared/junction";
import { closeEnough } from "../shared/linearize";
import { init, TwoTerminalModel } from "../shared/modelKit";
import { num, type Props } from "../shared/props";

/**
 * VaractorElm (CircuitJS1): the Falstad forward-drop diode (DiodeModel with
 * emission coefficient 2) in parallel with a capacitor whose value is set at
 * the start of each step from the previous step's voltage, then held:
 *   C = C0                      v >= 0
 *   C = C0 / sqrt(1 - v / Vf)   v < 0
 * The capacitor uses the usual companion model (BE or trapezoidal).
 */
class VaractorModel extends TwoTerminalModel {
  readonly nonlinear = true;
  override stateSize = 4; // cap v[n-1], i[n-1], i[n-2]; diode v
  private junction = new Junction();
  private c0 = 4e-12;
  private vf = 0.805904783;
  private vPrev = 0;
  private iPrev = 0;
  private iPrev2 = 0;
  private vIter = 0;
  private vAcc = 0;
  private c = 4e-12;
  private geq = 0;
  private ieq = 0;
  private gmin = 0;

  protected applyProps(p: Props): void {
    this.c0 = Math.max(1e-18, num(p, "baseCapacitance", 4e-12));
    this.vf = Math.max(0.05, num(p, "forwardVoltage", 0.805904783));
    this.junction.setParams(saturationFromDrop(this.vf), 2);
  }

  initialize(): void {
    this.vPrev = this.iPrev = this.iPrev2 = 0;
    this.vIter = this.vAcc = 0;
  }

  private capacitanceAt(v: number): number {
    return v > 0 ? this.c0 : this.c0 / Math.sqrt(1 - v / this.vf);
  }

  stampStep(s: Stamper, step: StepInfo): void {
    this.c = this.capacitanceAt(this.vPrev);
    if (step.kind !== "transient" || !(step.dt > 0)) {
      this.geq = 0;
      this.ieq = 0;
      return;
    }
    if (step.method === "trap") {
      this.geq = (2 * this.c) / step.dt;
      this.ieq = -this.geq * this.vPrev - this.iPrev;
    } else {
      this.geq = this.c / step.dt;
      this.ieq = -this.geq * this.vPrev;
    }
    s.conductance(this.a, this.b, this.geq);
    s.current(this.a, this.b, this.ieq);
  }

  stampNewton(s: Stamper, x: SolutionView, step: StepInfo): void {
    this.gmin = step.gmin;
    if (step.kind === "ac") {
      s.conductance(this.a, this.b, this.junction.conductance(this.vAcc) + step.gmin);
      return;
    }
    const v = this.junction.limit(this.voltage(x), this.vIter);
    this.vIter = v;
    const gd = this.junction.conductance(v);
    s.conductance(this.a, this.b, gd + step.gmin);
    s.current(this.a, this.b, this.junction.current(v) - gd * v);
  }

  stampAC(s: ComplexStamper, op: SolutionView, omega: number): void {
    const v = this.voltage(op);
    s.admittance(this.a, this.b, this.junction.conductance(v) + this.gmin, omega * this.capacitanceAt(v));
  }

  hasConverged(x: SolutionView): boolean {
    return closeEnough(this.voltage(x), this.vIter);
  }

  override accept(x: SolutionView, step: StepInfo): void {
    const v = this.voltage(x);
    const i = step.kind === "transient" && step.dt > 0 ? this.geq * v + this.ieq : 0;
    this.iPrev2 = this.iPrev;
    this.iPrev = i;
    this.vPrev = v;
    this.vAcc = v;
    this.vIter = v;
  }

  truncationError(x: SolutionView, step: StepInfo): number {
    if (step.kind !== "transient" || !(step.dt > 0)) return 0;
    const i = this.geq * this.voltage(x) + this.ieq;
    if (step.method === "trap") return Math.abs((step.dt * (i - 2 * this.iPrev + this.iPrev2)) / (12 * this.c));
    return Math.abs((step.dt * (i - this.iPrev)) / (2 * this.c));
  }

  protected current(x: SolutionView): number {
    const v = this.voltage(x);
    return this.junction.current(v) + this.gmin * v + this.iPrev;
  }

  override readouts(x: SolutionView, out: ReadoutSink): void {
    super.readouts(x, out);
    out.add("capacitance", this.capacitanceAt(this.vPrev));
  }

  override saveState(out: Float64Array): void {
    out[0] = this.vPrev;
    out[1] = this.iPrev;
    out[2] = this.iPrev2;
    out[3] = this.vAcc;
  }

  override loadState(from: Float64Array): void {
    this.vPrev = from[0] ?? 0;
    this.iPrev = from[1] ?? 0;
    this.iPrev2 = from[2] ?? 0;
    this.vAcc = from[3] ?? this.vPrev;
    this.vIter = this.vAcc;
  }
}

export const varactorModel: ModelFactory = (el) => init(new VaractorModel(el), el);
