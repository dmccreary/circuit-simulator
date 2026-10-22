import type { ComplexStamper, ModelFactory, ReadoutSink, SolutionView, StepInfo, Stamper, StressReport } from "../api";
import { init, TwoTerminalModel } from "../shared/modelKit";
import { num, type Props } from "../shared/props";

/**
 * Capacitor companion model (as capacitor/model.ts) behind an optional series
 * resistance R (CapacitorElm's seriesResistance), folded into one Norton pair:
 *   i = (geq·v + ieq) / (1 + geq·R),  capacitor voltage vc = v - R·i
 * PolarCapacitorElm.stepFinished() stops when vc < -maxNegativeVoltage; here
 * that is reported by stress() and the "reverseOverLimit" readout.
 */
class PolarCapacitorModel extends TwoTerminalModel {
  override stateSize = 3; // vc[n-1], i[n-1], i[n-2]
  private c = 10e-6;
  private v0 = 0;
  private r = 0;
  private maxRev = 1;
  private vPrev = 0;
  private iPrev = 0;
  private iPrev2 = 0;
  private g = 0;
  private ieq = 0;

  protected applyProps(p: Props): void {
    this.c = Math.max(1e-18, num(p, "capacitance", 10e-6));
    this.v0 = num(p, "initialVoltage", 0);
    this.r = Math.max(0, num(p, "seriesResistance", 0));
    this.maxRev = Math.max(0, num(p, "maxReverseVoltage", 1));
  }

  initialize(): void {
    this.vPrev = this.v0;
    this.iPrev = 0;
    this.iPrev2 = 0;
  }

  stampStep(s: Stamper, step: StepInfo): void {
    if (step.kind !== "transient" || !(step.dt > 0)) {
      this.g = 0;
      this.ieq = 0;
      return;
    }
    let geq: number;
    let ieq: number;
    if (step.method === "trap") {
      geq = (2 * this.c) / step.dt;
      ieq = -geq * this.vPrev - this.iPrev;
    } else {
      geq = this.c / step.dt;
      ieq = -geq * this.vPrev;
    }
    const k = 1 / (1 + geq * this.r);
    this.g = geq * k;
    this.ieq = ieq * k;
    s.conductance(this.a, this.b, this.g);
    s.current(this.a, this.b, this.ieq);
  }

  stampAC(s: ComplexStamper, _op: SolutionView, omega: number): void {
    // Y = 1 / (R + 1/(jωC)) = jωC / (1 + jωRC)
    const wc = omega * this.c;
    const d = 1 + (wc * this.r) ** 2;
    s.admittance(this.a, this.b, (wc * wc * this.r) / d, wc / d);
  }

  private stepCurrent(x: SolutionView): number {
    return this.g * this.voltage(x) + this.ieq;
  }

  override accept(x: SolutionView, step: StepInfo): void {
    const i = step.kind === "transient" && step.dt > 0 ? this.stepCurrent(x) : 0;
    this.iPrev2 = this.iPrev;
    this.iPrev = i;
    this.vPrev = this.voltage(x) - this.r * i;
  }

  truncationError(x: SolutionView, step: StepInfo): number {
    if (step.kind !== "transient" || !(step.dt > 0)) return 0;
    const i = this.stepCurrent(x);
    if (step.method === "trap") return Math.abs((step.dt * (i - 2 * this.iPrev + this.iPrev2)) / (12 * this.c));
    return Math.abs((step.dt * (i - this.iPrev)) / (2 * this.c));
  }

  stress(): StressReport | undefined {
    return this.vPrev < -this.maxRev ? { overLimit: true, failMode: "short" } : undefined;
  }

  protected current(_x: SolutionView): number {
    return this.iPrev;
  }

  override readouts(x: SolutionView, out: ReadoutSink): void {
    super.readouts(x, out);
    const v = this.vPrev;
    out.add("capacitance", this.c);
    out.add("charge", this.c * v);
    out.add("energy", 0.5 * this.c * v * v);
    out.add("reverseOverLimit", v < -this.maxRev ? 1 : 0);
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

export const polarCapacitorModel: ModelFactory = (el) => init(new PolarCapacitorModel(el), el);
