import type { ModelFactory, ReadoutSink, SolutionView, StepInfo, Stamper } from "../api";
import { init, TwoTerminalModel } from "../shared/modelKit";
import { num, type Props } from "../shared/props";

/**
 * Companion model: a conductance geq in parallel with a current source, so the
 * current from terminal 0 to 1 is i = geq·v + ieq.
 *   BE:   geq = C/dt,  ieq = -geq·v[n-1]
 *   trap: geq = 2C/dt, ieq = -geq·v[n-1] - i[n-1]
 * Open circuit for DC. AC small-signal is not stamped yet (the Stamper is real-valued).
 */
class CapacitorModel extends TwoTerminalModel {
  override stateSize = 3; // v[n-1], i[n-1], i[n-2]
  private c = 10e-6;
  private v0 = 0;
  private vPrev = 0;
  private iPrev = 0;
  private iPrev2 = 0;
  private geq = 0;
  private ieq = 0;

  protected applyProps(p: Props): void {
    this.c = Math.max(1e-18, num(p, "capacitance", 10e-6));
    this.v0 = num(p, "initialVoltage", 0);
  }

  initialize(): void {
    this.vPrev = this.v0;
    this.iPrev = 0;
    this.iPrev2 = 0;
  }

  stampStep(s: Stamper, step: StepInfo): void {
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

  /** Current of the step being solved, from the companion model last stamped. */
  private stepCurrent(x: SolutionView): number {
    return this.geq * this.voltage(x) + this.ieq;
  }

  override accept(x: SolutionView, step: StepInfo): void {
    const v = this.voltage(x);
    const i = step.kind === "transient" && step.dt > 0 ? this.stepCurrent(x) : 0;
    this.iPrev2 = this.iPrev;
    this.iPrev = i;
    this.vPrev = v;
  }

  /** Estimated local truncation error of the capacitor voltage, volts. */
  truncationError(x: SolutionView, step: StepInfo): number {
    if (step.kind !== "transient" || !(step.dt > 0)) return 0;
    const i = this.stepCurrent(x);
    if (step.method === "trap") return Math.abs((step.dt * (i - 2 * this.iPrev + this.iPrev2)) / (12 * this.c));
    return Math.abs((step.dt * (i - this.iPrev)) / (2 * this.c));
  }

  protected current(_x: SolutionView): number {
    return this.iPrev;
  }

  override readouts(x: SolutionView, out: ReadoutSink): void {
    super.readouts(x, out);
    const v = this.voltage(x);
    out.add("capacitance", this.c);
    out.add("charge", this.c * v);
    out.add("energy", 0.5 * this.c * v * v);
  }

  override saveState(out: Float64Array): void {
    out[0] = this.vPrev;
    out[1] = this.iPrev;
    out[2] = this.iPrev2;
  }

  override loadState(from: Float64Array): void {
    this.vPrev = from[0] ?? 0;
    this.iPrev = from[1] ?? 0;
    this.iPrev2 = from[2] ?? 0;
  }
}

export const capacitorModel: ModelFactory = (el) => init(new CapacitorModel(el), el);
