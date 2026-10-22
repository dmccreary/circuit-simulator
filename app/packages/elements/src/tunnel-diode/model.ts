import type { ComplexStamper, ModelFactory, SolutionView, StepInfo, Stamper } from "../api";
import { exp } from "../shared/math";
import { closeEnough, limitStep } from "../shared/linearize";
import { init, TwoTerminalModel } from "../shared/modelKit";
import type { Props } from "../shared/props";

// TunnelDiodeElm constants (CircuitJS1): peak voltage/current, valley voltage, thermal voltage, ...
const PVP = 0.1;
const PIP = 4.7e-3;
const PVV = 0.37;
const PVT = 0.026;
const PVPP = 0.525;
const PIV = 370e-6;
const I0 = PIV * exp(-PVV);
const PRE = PIP * exp(-PVPP / PVT);
/** Exponents beyond this continue linearly, so the curve never overflows. */
const ARG_MAX = 80;

/** e^a and its derivative in a, continued as a straight line past ARG_MAX. */
function sexp(a: number): [number, number] {
  if (a > ARG_MAX) {
    const e = exp(ARG_MAX);
    return [e * (1 + a - ARG_MAX), e];
  }
  const e = exp(a);
  return [e, e];
}

/** Current and conductance of TunnelDiodeElm.doStep() at junction voltage v. */
export function tunnelCurve(v: number): { i: number; g: number } {
  const [e1, d1] = sexp(v / PVT);
  const [e2, d2] = sexp(1 - v / PVP);
  const [e3, d3] = sexp(v - PVV);
  const i = PRE * (e1 - 1) + PIP * (v / PVP) * e2 + PIV * e3 - I0;
  const g = (PRE * d1) / PVT + (PIP / PVP) * e2 - (PIP * v * d2) / (PVP * PVP) + PIV * d3;
  return { i, g };
}

/** Newton step limited to 1 V per iteration, as TunnelDiodeElm.limitStep(). */
class TunnelDiodeModel extends TwoTerminalModel {
  readonly nonlinear = true;
  override stateSize = 1;
  private vIter = 0;
  private vAcc = 0;
  private gmin = 0;

  protected applyProps(_p: Props): void {}

  initialize(): void {
    this.vIter = 0;
    this.vAcc = 0;
  }

  stampNewton(s: Stamper, x: SolutionView, step: StepInfo): void {
    this.gmin = step.gmin;
    if (step.kind === "ac") {
      s.conductance(this.a, this.b, tunnelCurve(this.vAcc).g + step.gmin);
      return;
    }
    const v = limitStep(this.voltage(x), this.vIter, 1);
    this.vIter = v;
    const { i, g } = tunnelCurve(v);
    s.conductance(this.a, this.b, g + step.gmin);
    s.current(this.a, this.b, i - g * v);
  }

  stampAC(s: ComplexStamper, op: SolutionView): void {
    s.admittance(this.a, this.b, tunnelCurve(this.voltage(op)).g + this.gmin, 0);
  }

  hasConverged(x: SolutionView): boolean {
    return closeEnough(this.voltage(x), this.vIter);
  }

  override accept(x: SolutionView): void {
    this.vAcc = this.voltage(x);
    this.vIter = this.vAcc;
  }

  protected current(x: SolutionView): number {
    const v = this.voltage(x);
    return tunnelCurve(v).i + this.gmin * v;
  }

  override saveState(out: Float64Array): void {
    out[0] = this.vAcc;
  }

  override loadState(from: Float64Array): void {
    this.vAcc = from[0] ?? 0;
    this.vIter = this.vAcc;
  }
}

export const tunnelDiodeModel: ModelFactory = (el) => init(new TunnelDiodeModel(el), el);
