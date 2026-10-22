import type { ModelFactory, ReadoutSink, SetupContext, SolutionView, StepInfo, Stamper, UnknownIndex } from "../api";
import { init, TwoTerminalModel } from "../shared/modelKit";
import { num, type Props } from "../shared/props";

/**
 * Branch-current formulation (dual of the capacitor), so DC is an exact short:
 *   V(a) - V(b) - req·i = veq
 *   BE:   req = L/dt,  veq = -req·i[n-1]
 *   trap: req = 2L/dt, veq = -req·i[n-1] - v[n-1]
 *   DC:   req = 0,     veq = 0
 */
class InductorModel extends TwoTerminalModel {
  override stateSize = 3; // i[n-1], v[n-1], v[n-2]
  private l = 1;
  private i0 = 0;
  private iPrev = 0;
  private vPrev = 0;
  private vPrev2 = 0;
  private branch: UnknownIndex = 0;

  protected applyProps(p: Props): void {
    this.l = Math.max(1e-15, num(p, "inductance", 1));
    this.i0 = num(p, "initialCurrent", 0);
  }

  override setup(ctx: SetupContext): void {
    super.setup(ctx);
    this.branch = ctx.allocBranch("i");
  }

  initialize(): void {
    this.iPrev = this.i0;
    this.vPrev = 0;
    this.vPrev2 = 0;
  }

  stampStep(s: Stamper, step: StepInfo): void {
    let req = 0;
    let veq = 0;
    if (step.kind === "transient" && step.dt > 0) {
      if (step.method === "trap") {
        req = (2 * this.l) / step.dt;
        veq = -req * this.iPrev - this.vPrev;
      } else {
        req = this.l / step.dt;
        veq = -req * this.iPrev;
      }
    }
    s.voltageSource(this.branch, this.a, this.b, veq);
    if (req !== 0) s.matrix(this.branch, this.branch, -req);
  }

  override accept(x: SolutionView, _step: StepInfo): void {
    this.vPrev2 = this.vPrev;
    this.vPrev = this.voltage(x);
    this.iPrev = x.x(this.branch);
  }

  /** Estimated local truncation error of the inductor current, amps. */
  truncationError(x: SolutionView, step: StepInfo): number {
    if (step.kind !== "transient" || !(step.dt > 0)) return 0;
    const v = this.voltage(x);
    if (step.method === "trap") return Math.abs((step.dt * (v - 2 * this.vPrev + this.vPrev2)) / (12 * this.l));
    return Math.abs((step.dt * (v - this.vPrev)) / (2 * this.l));
  }

  protected current(x: SolutionView): number {
    return x.x(this.branch);
  }

  override readouts(x: SolutionView, out: ReadoutSink): void {
    super.readouts(x, out);
    const i = this.current(x);
    out.add("inductance", this.l);
    out.add("flux", this.l * i);
    out.add("energy", 0.5 * this.l * i * i);
  }

  override saveState(out: Float64Array): void {
    out[0] = this.iPrev;
    out[1] = this.vPrev;
    out[2] = this.vPrev2;
  }

  override loadState(from: Float64Array): void {
    this.iPrev = from[0] ?? 0;
    this.vPrev = from[1] ?? 0;
    this.vPrev2 = from[2] ?? 0;
  }
}

export const inductorModel: ModelFactory = (el) => init(new InductorModel(el), el);
