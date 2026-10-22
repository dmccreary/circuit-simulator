import type { ModelFactory, ReadoutSink, SolutionView, StepInfo, Stamper } from "../api";
import { Junction, VT } from "../shared/junction";
import { closeEnough } from "../shared/linearize";
import { log } from "../shared/math";
import { init, TwoTerminalModel } from "../shared/modelKit";
import { num, type Props } from "../shared/props";

/** Reverse current at exactly -zenerVoltage (a typical zener test current). */
const I_ZT = 0.005;

/**
 * Shockley diode plus an exponential breakdown branch:
 *   I(v) = Jf(v) - [Jb(u) - Jb(u0)],  u = c - v,  u0 = c
 * where Jb has the same Is and n, and c is chosen so the reverse current is
 * I_ZT at v = -zenerVoltage. Each branch gets pnjlim limiting; gmin in parallel.
 */
class ZenerModel extends TwoTerminalModel {
  readonly nonlinear = true;
  override stateSize = 1;
  private fwd = new Junction();
  private bd = new Junction();
  private c = 0;
  private vz = 5.6;
  private vIter = 0;
  private vAcc = 0;
  private gmin = 0;

  protected applyProps(p: Props): void {
    const is = num(p, "saturationCurrent", 1e-14);
    const n = num(p, "emissionCoefficient", 1);
    this.fwd.setParams(is, n);
    this.bd.setParams(is, n);
    this.vz = Math.max(0.1, num(p, "zenerVoltage", 5.6));
    // Jb(c + vz) = I_ZT with Jb(u) = Is(exp(u/nVt) - 1)
    const nvt = Math.max(0.1, n) * VT; // as Junction.setParams
    this.c = nvt * log(1 + I_ZT / Math.max(1e-30, is)) - this.vz;
  }

  initialize(): void {
    this.vIter = 0;
    this.vAcc = 0;
  }

  private branch(v: number): [number, number] {
    const u = this.c - v;
    const i = this.fwd.current(v) - (this.bd.current(u) - this.bd.current(this.c));
    const g = this.fwd.conductance(v) + this.bd.conductance(u);
    return [i, g];
  }

  stampNewton(s: Stamper, x: SolutionView, step: StepInfo): void {
    this.gmin = step.gmin;
    if (step.kind === "ac") {
      s.conductance(this.a, this.b, this.branch(this.vAcc)[1] + step.gmin);
      return;
    }
    let v = this.fwd.limit(this.voltage(x), this.vIter);
    v = this.c - this.bd.limit(this.c - v, this.c - this.vIter);
    this.vIter = v;
    const [i, g] = this.branch(v);
    s.conductance(this.a, this.b, g + step.gmin);
    s.current(this.a, this.b, i - g * v);
  }

  hasConverged(x: SolutionView, _previous: SolutionView): boolean {
    return closeEnough(this.voltage(x), this.vIter);
  }

  override accept(x: SolutionView, _step: StepInfo): void {
    this.vAcc = this.voltage(x);
    this.vIter = this.vAcc;
  }

  protected current(x: SolutionView): number {
    const v = this.voltage(x);
    return this.branch(v)[0] + this.gmin * v;
  }

  override readouts(x: SolutionView, out: ReadoutSink): void {
    super.readouts(x, out);
    const i = this.current(x);
    out.add("state", i > 1e-6 ? 1 : i < -1e-6 && this.voltage(x) < -0.5 * this.vz ? 2 : 0);
  }

  override saveState(out: Float64Array): void {
    out[0] = this.vAcc;
  }

  override loadState(from: Float64Array): void {
    this.vAcc = from[0] ?? 0;
    this.vIter = this.vAcc;
  }
}

export const zenerDiodeModel: ModelFactory = (el) => init(new ZenerModel(el), el);
