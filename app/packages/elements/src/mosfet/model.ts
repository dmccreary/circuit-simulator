import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ComplexStamper, ElementModel, ModelFactory, ReadoutSink, SetupContext, SolutionView, StepInfo, Stamper } from "../api";
import { realPart } from "../shared/acStamp";
import { closeEnough, limitStep, stampLinearized, type ControlPair } from "../shared/linearize";
import { init } from "../shared/modelKit";
import { num, type Props } from "../shared/props";

/** Drain current (device frame, into the drain) and its derivatives. */
interface Eval {
  id: number;
  dVgs: number;
  dVds: number;
  region: 0 | 1 | 2;
}

/**
 * Shichman–Hodges (SPICE level 1) MOSFET with the body tied to the source:
 *   cut-off     Vgs <= Vt:          Id = 0
 *   linear      Vds <  Vgs - Vt:    Id = β((Vgs-Vt)Vds - Vds²/2)(1 + λVds)
 *   saturation  otherwise:          Id = β/2 (Vgs-Vt)² (1 + λVds)
 * The channel is symmetric: with Vds < 0 drain and source swap roles.
 * Terminals G, D, S; P-channel negates every voltage and current (p = -1).
 */
class MosfetModel implements ElementModel {
  readonly nonlinear = true;
  readonly stateSize = 2;
  private n: NodeIndex[];
  private ctrl: ControlPair[] = [];
  private vt = 1.5;
  private beta = 0.02;
  private lambda = 0;
  private vgsIter = 0;
  private vdsIter = 0;
  private vgsAcc = 0;
  private vdsAcc = 0;
  private gmin = 0;

  constructor(
    el: NetlistElement,
    private readonly p: 1 | -1,
  ) {
    this.n = [el.nodes[0] ?? 0, el.nodes[1] ?? 0, el.nodes[2] ?? 0];
    this.wire();
  }

  private wire(): void {
    const [g, d, s] = this.n;
    this.ctrl = [
      { plus: g, minus: s },
      { plus: d, minus: s },
    ];
  }

  setup(ctx: SetupContext): void {
    this.n = [ctx.nodes[0] ?? 0, ctx.nodes[1] ?? 0, ctx.nodes[2] ?? 0];
    this.wire();
  }

  setProps(p: Props): void {
    this.vt = num(p, "threshold", 1.5);
    this.beta = Math.max(1e-12, num(p, "beta", 0.02));
    this.lambda = Math.max(0, num(p, "lambda", 0));
  }

  initialize(): void {
    this.vgsIter = this.vdsIter = this.vgsAcc = this.vdsAcc = 0;
  }

  private voltages(x: SolutionView): [number, number] {
    const [g, d, s] = this.n;
    return [this.p * (x.v(g) - x.v(s)), this.p * (x.v(d) - x.v(s))];
  }

  /** Forward-mode square law, Vds >= 0. */
  private forward(vgs: number, vds: number): Eval {
    const vov = vgs - this.vt;
    if (vov <= 0) return { id: 0, dVgs: 0, dVds: 0, region: 0 };
    const b = this.beta;
    const cl = 1 + this.lambda * vds;
    if (vds < vov) {
      const core = vov * vds - 0.5 * vds * vds;
      return { id: b * core * cl, dVgs: b * vds * cl, dVds: b * ((vov - vds) * cl + this.lambda * core), region: 1 };
    }
    return { id: 0.5 * b * vov * vov * cl, dVgs: b * vov * cl, dVds: 0.5 * b * vov * vov * this.lambda, region: 2 };
  }

  private evaluate(vgs: number, vds: number): Eval {
    if (vds >= 0) return this.forward(vgs, vds);
    // Reversed: the drain acts as source. Id(rev) flows source -> drain.
    const r = this.forward(vgs - vds, -vds);
    return { id: -r.id, dVgs: -r.dVgs, dVds: r.dVgs + r.dVds, region: r.region };
  }

  stampNewton(s: Stamper, x: SolutionView, step: StepInfo): void {
    this.gmin = step.gmin;
    const [, d, src] = this.n;
    if (step.kind === "ac") {
      const ev = this.evaluate(this.vgsAcc, this.vdsAcc);
      const g = [[0, 0], [ev.dVgs, ev.dVds], [-ev.dVgs, -ev.dVds]];
      stampLinearized(s, this.n, this.ctrl, [0, 0], [0, 0, 0], g, true);
      s.conductance(d, src, step.gmin);
      return;
    }
    const [rgs, rds] = this.voltages(x);
    // fetlim/limvds-style damping: bounded steps that grow with the overdrive.
    const vgs = limitStep(rgs, this.vgsIter, 2 + 3 * Math.abs(this.vgsIter - this.vt));
    const vds = limitStep(rds, this.vdsIter, 2 + 3 * Math.abs(this.vdsIter));
    this.vgsIter = vgs;
    this.vdsIter = vds;
    const ev = this.evaluate(vgs, vds);
    const p = this.p;
    const g = [[0, 0], [ev.dVgs, ev.dVds], [-ev.dVgs, -ev.dVds]];
    stampLinearized(s, this.n, this.ctrl, [p * vgs, p * vds], [0, p * ev.id, -p * ev.id], g);
    s.conductance(d, src, step.gmin);
  }

  /** Small-signal gm and gds at the operating point. */
  stampAC(s: ComplexStamper, op: SolutionView): void {
    const [vgs, vds] = this.voltages(op);
    const ev = this.evaluate(vgs, vds);
    const g = [[0, 0], [ev.dVgs, ev.dVds], [-ev.dVgs, -ev.dVds]];
    const rs = realPart(s);
    stampLinearized(rs, this.n, this.ctrl, [0, 0], [0, 0, 0], g, true);
    rs.conductance(this.n[1], this.n[2], this.gmin);
  }

  hasConverged(x: SolutionView, _previous: SolutionView): boolean {
    const [vgs, vds] = this.voltages(x);
    return closeEnough(vgs, this.vgsIter) && closeEnough(vds, this.vdsIter);
  }

  accept(x: SolutionView, _step: StepInfo): void {
    [this.vgsAcc, this.vdsAcc] = this.voltages(x);
    this.vgsIter = this.vgsAcc;
    this.vdsIter = this.vdsAcc;
  }

  private drainCurrent(x: SolutionView): number {
    const [vgs, vds] = this.voltages(x);
    return this.p * (this.evaluate(vgs, vds).id + this.gmin * vds);
  }

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    const id = this.drainCurrent(x);
    out[0] = 0;
    out[1] = id;
    out[2] = -id;
  }

  readouts(x: SolutionView, out: ReadoutSink): void {
    const [vgs, vds] = this.voltages(x);
    const ev = this.evaluate(vgs, vds);
    const id = this.drainCurrent(x);
    out.add("region", ev.region);
    out.add("id", id);
    out.add("vgs", this.p * vgs);
    out.add("vds", this.p * vds);
    out.add("gm", ev.dVgs);
    out.add("power", this.p * vds * id);
  }

  saveState(out: Float64Array): void {
    out[0] = this.vgsAcc;
    out[1] = this.vdsAcc;
  }

  loadState(from: Float64Array): void {
    this.vgsAcc = from[0] ?? 0;
    this.vdsAcc = from[1] ?? 0;
    this.vgsIter = this.vgsAcc;
    this.vdsIter = this.vdsAcc;
  }
}

export const nMosfetModel: ModelFactory = (el) => init(new MosfetModel(el, 1), el);
export const pMosfetModel: ModelFactory = (el) => init(new MosfetModel(el, -1), el);
