import type { ComplexStamper, ModelFactory, SetupContext, SolutionView, StepInfo, Stamper, UnknownIndex } from "../api";
import { init, TwoTerminalModel } from "../shared/modelKit";
import { num, type Props } from "../shared/props";
import { CRYSTAL_DEFAULTS, crystalFrequency, crystalInductance } from "./descriptor";

/**
 * CrystalElm's composite ("CapacitorElm 1 2, CapacitorElm 1 3, InductorElm 3 4,
 * ResistorElm 4 2") as one model. The holder capacitance Cp is a Norton
 * companion between the terminals. The motional arm uses two extra unknowns,
 * its current i and its capacitor voltage vs, so every reactive term keeps the
 * engine's G + C/dt form:
 *   V(a) - V(b) - (R + kL/dt)·i - vs = -(kL/dt)·i[n-1] - [trap] vL[n-1]
 *   (kCs/dt)·vs - i                  =  (kCs/dt)·vs[n-1] + [trap] i[n-1]
 * with k = 1 (BE) or 2 (trap). At DC the second row reads i = 0.
 */
class CrystalModel extends TwoTerminalModel {
  override stateSize = 7;
  private cp = CRYSTAL_DEFAULTS.parallelCapacitance;
  private cs = CRYSTAL_DEFAULTS.seriesCapacitance;
  private l = CRYSTAL_DEFAULTS.inductance;
  private r = CRYSTAL_DEFAULTS.resistance;
  private bi: UnknownIndex = 0;
  private bv: UnknownIndex = 0;
  // holder capacitor: v[n-1], i[n-1], i[n-2]; arm: i[n-1], vs[n-1], vL[n-1], vL[n-2]
  private vpPrev = 0;
  private ipPrev = 0;
  private ipPrev2 = 0;
  private iPrev = 0;
  private vsPrev = 0;
  private vlPrev = 0;
  private vlPrev2 = 0;
  private gp = 0;
  private ip = 0;

  protected applyProps(p: Props): void {
    this.cs = Math.max(1e-21, num(p, "seriesCapacitance", CRYSTAL_DEFAULTS.seriesCapacitance));
    this.cp = Math.max(0, num(p, "parallelCapacitance", CRYSTAL_DEFAULTS.parallelCapacitance));
    this.r = Math.max(0, num(p, "resistance", CRYSTAL_DEFAULTS.resistance));
    const f = num(p, "frequency", crystalFrequency(CRYSTAL_DEFAULTS.inductance, CRYSTAL_DEFAULTS.seriesCapacitance));
    this.l = crystalInductance(Math.max(1e-3, f), this.cs);
  }

  override setup(ctx: SetupContext): void {
    super.setup(ctx);
    this.bi = ctx.allocBranch("i");
    this.bv = ctx.allocBranch("vs");
  }

  initialize(): void {
    this.vpPrev = this.ipPrev = this.ipPrev2 = 0;
    this.iPrev = this.vsPrev = this.vlPrev = this.vlPrev2 = 0;
  }

  stampStep(s: Stamper, step: StepInfo): void {
    const tran = step.kind === "transient" && step.dt > 0;
    const k = step.method === "trap" ? 2 : 1;
    const trap = tran && k === 2;
    // Holder capacitance.
    if (tran && this.cp > 0) {
      this.gp = (k * this.cp) / step.dt;
      this.ip = -this.gp * this.vpPrev - (trap ? this.ipPrev : 0);
      s.conductance(this.a, this.b, this.gp);
      s.current(this.a, this.b, this.ip);
    } else {
      this.gp = 0;
      this.ip = 0;
    }
    // Motional arm.
    const lt = tran ? (k * this.l) / step.dt : 0;
    const ct = tran ? (k * this.cs) / step.dt : 0;
    s.voltageSource(this.bi, this.a, this.b, -lt * this.iPrev - (trap ? this.vlPrev : 0));
    s.matrix(this.bi, this.bi, -(this.r + lt));
    s.matrix(this.bi, this.bv, -1);
    s.matrix(this.bv, this.bv, ct);
    s.matrix(this.bv, this.bi, -1);
    s.rhs(this.bv, ct * this.vsPrev + (trap ? this.iPrev : 0));
  }

  /** V = I·(R + jωL + 1/(jωCs)) for the arm, jωCp for the holder. */
  stampAC(s: ComplexStamper, _op: SolutionView, omega: number): void {
    s.admittance(this.a, this.b, 0, omega * this.cp);
    s.voltageSource(this.bi, this.a, this.b, 0, 0);
    s.matrix(this.bi, this.bi, -this.r, -omega * this.l);
    s.matrix(this.bi, this.bv, -1, 0);
    s.matrix(this.bv, this.bv, 0, omega * this.cs);
    s.matrix(this.bv, this.bi, -1, 0);
  }

  private inductorVoltage(x: SolutionView): number {
    return this.voltage(x) - this.r * x.x(this.bi) - x.x(this.bv);
  }

  override accept(x: SolutionView, step: StepInfo): void {
    const v = this.voltage(x);
    const ipNow = step.kind === "transient" && step.dt > 0 ? this.gp * v + this.ip : 0;
    this.ipPrev2 = this.ipPrev;
    this.ipPrev = ipNow;
    this.vpPrev = v;
    this.vlPrev2 = this.vlPrev;
    this.vlPrev = this.inductorVoltage(x);
    this.iPrev = x.x(this.bi);
    this.vsPrev = x.x(this.bv);
  }

  /** Local truncation error of the motional current (amps), as the inductor's. */
  truncationError(x: SolutionView, step: StepInfo): number {
    if (step.kind !== "transient" || !(step.dt > 0)) return 0;
    const vl = this.inductorVoltage(x);
    if (step.method === "trap") return Math.abs((step.dt * (vl - 2 * this.vlPrev + this.vlPrev2)) / (12 * this.l));
    return Math.abs((step.dt * (vl - this.vlPrev)) / (2 * this.l));
  }

  protected current(x: SolutionView): number {
    return this.ipPrev + x.x(this.bi);
  }

  override saveState(out: Float64Array): void {
    out.set([this.vpPrev, this.ipPrev, this.ipPrev2, this.iPrev, this.vsPrev, this.vlPrev, this.vlPrev2]);
  }

  override loadState(from: Float64Array): void {
    [this.vpPrev, this.ipPrev, this.ipPrev2, this.iPrev, this.vsPrev, this.vlPrev, this.vlPrev2] = Array.from({ length: 7 }, (_, k) => from[k] ?? 0);
  }
}

export const crystalModel: ModelFactory = (el) => init(new CrystalModel(el), el);
