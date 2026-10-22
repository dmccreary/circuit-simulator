import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ElementModel, ModelFactory, ReadoutSink, SetupContext, SolutionView, StepInfo, Stamper } from "../api";
import { Junction } from "../shared/junction";
import { closeEnough, stampLinearized, type ControlPair } from "../shared/linearize";
import { init } from "../shared/modelKit";
import { num, type Props } from "../shared/props";

/** A junction counts as forward biased above this, for the region readout. */
const ON_V = 0.5;

/** Terminal currents (device polarity) and their derivatives w.r.t. (vbe, vbc). */
interface Eval {
  i: [number, number, number]; // B, C, E
  g: [number, number][];
}

/**
 * Ebers–Moll transport model (SPICE Gummel–Poon level 1 without Early effect,
 * high injection or resistances). Terminals B, C, E. Each junction gets pnjlim
 * voltage limiting and a gmin shunt. PNP is the NPN equations with every
 * voltage and current negated (polarity p = -1).
 */
class BjtModel implements ElementModel {
  readonly nonlinear = true;
  readonly stateSize = 2;
  private n: NodeIndex[];
  private ctrl: ControlPair[] = [];
  private betaF = 100;
  private betaR = 1;
  private junction = new Junction();
  /** Device-frame junction voltages used for the latest Newton stamp. */
  private vbeIter = 0;
  private vbcIter = 0;
  /** Accepted operating point (also the small-signal point for "ac"). */
  private vbeAcc = 0;
  private vbcAcc = 0;
  private fresh = true;
  private gmin = 0;

  constructor(
    el: NetlistElement,
    private readonly p: 1 | -1,
  ) {
    this.n = [el.nodes[0] ?? 0, el.nodes[1] ?? 0, el.nodes[2] ?? 0];
    this.wire();
  }

  private wire(): void {
    const [b, c, e] = this.n;
    this.ctrl = [
      { plus: b, minus: e },
      { plus: b, minus: c },
    ];
  }

  setup(ctx: SetupContext): void {
    this.n = [ctx.nodes[0] ?? 0, ctx.nodes[1] ?? 0, ctx.nodes[2] ?? 0];
    this.wire();
  }

  setProps(p: Props): void {
    this.betaF = Math.max(1e-3, num(p, "beta", 100));
    this.betaR = Math.max(1e-3, num(p, "betaReverse", 1));
    this.junction.setParams(num(p, "saturationCurrent", 1e-14), 1);
  }

  initialize(): void {
    this.vbeIter = this.vbcIter = this.vbeAcc = this.vbcAcc = 0;
    this.fresh = true;
  }

  /** Device-frame (vbe, vbc) from a solution. */
  private junctions(x: SolutionView): [number, number] {
    const [b, c, e] = this.n;
    return [this.p * (x.v(b) - x.v(e)), this.p * (x.v(b) - x.v(c))];
  }

  private evaluate(vbe: number, vbc: number, gmin: number): Eval {
    const j = this.junction;
    const cbe = j.current(vbe) + gmin * vbe;
    const cbc = j.current(vbc) + gmin * vbc;
    const gbe = j.conductance(vbe) + gmin;
    const gbc = j.conductance(vbc) + gmin;
    const bf = this.betaF;
    const br = this.betaR;
    const ib = cbe / bf + cbc / br;
    const ic = cbe - cbc - cbc / br;
    return {
      i: [ib, ic, -(ib + ic)],
      g: [
        [gbe / bf, gbc / br],
        [gbe, -gbc * (1 + 1 / br)],
        [-gbe * (1 + 1 / bf), gbc],
      ],
    };
  }

  stampNewton(s: Stamper, x: SolutionView, step: StepInfo): void {
    this.gmin = step.gmin;
    if (step.kind === "ac") {
      const ev = this.evaluate(this.vbeAcc, this.vbcAcc, step.gmin);
      stampLinearized(s, this.n, this.ctrl, [0, 0], [0, 0, 0], ev.g, true);
      return;
    }
    let vbe: number;
    let vbc: number;
    if (this.fresh) {
      // SPICE's MODEINITJCT: start with the emitter junction near conduction.
      vbe = this.junction.criticalVoltage();
      vbc = 0;
      this.fresh = false;
    } else {
      const [rbe, rbc] = this.junctions(x);
      vbe = this.junction.limit(rbe, this.vbeIter);
      vbc = this.junction.limit(rbc, this.vbcIter);
    }
    this.vbeIter = vbe;
    this.vbcIter = vbc;
    const ev = this.evaluate(vbe, vbc, step.gmin);
    const p = this.p;
    stampLinearized(s, this.n, this.ctrl, [p * vbe, p * vbc], ev.i.map((i) => p * i), ev.g);
  }

  hasConverged(x: SolutionView, _previous: SolutionView): boolean {
    const [vbe, vbc] = this.junctions(x);
    return closeEnough(vbe, this.vbeIter) && closeEnough(vbc, this.vbcIter);
  }

  accept(x: SolutionView, _step: StepInfo): void {
    [this.vbeAcc, this.vbcAcc] = this.junctions(x);
    this.vbeIter = this.vbeAcc;
    this.vbcIter = this.vbcAcc;
    this.fresh = false;
  }

  /** Currents into B, C, E (circuit polarity). */
  terminalCurrents(x: SolutionView, out: Float64Array): void {
    const [vbe, vbc] = this.junctions(x);
    const ev = this.evaluate(vbe, vbc, this.gmin);
    for (let k = 0; k < 3; k++) out[k] = this.p * ev.i[k];
  }

  readouts(x: SolutionView, out: ReadoutSink): void {
    const [vbe, vbc] = this.junctions(x);
    const cur = new Float64Array(3);
    this.terminalCurrents(x, cur);
    const [b, c, e] = this.n;
    const vb = x.v(b);
    const vc = x.v(c);
    const ve = x.v(e);
    const beOn = vbe > ON_V;
    const bcOn = vbc > ON_V;
    out.add("region", beOn ? (bcOn ? 2 : 1) : bcOn ? 3 : 0);
    out.add("ib", cur[0]);
    out.add("ic", cur[1]);
    out.add("ie", -cur[2]); // conventional emitter current, out of the emitter for NPN
    out.add("vbe", vb - ve);
    out.add("vce", vc - ve);
    out.add("vbc", vb - vc);
    out.add("power", vb * cur[0] + vc * cur[1] + ve * cur[2]);
    out.add("gain", Math.abs(cur[0]) > 1e-15 ? cur[1] / cur[0] : 0);
  }

  saveState(out: Float64Array): void {
    out[0] = this.vbeAcc;
    out[1] = this.vbcAcc;
  }

  loadState(from: Float64Array): void {
    this.vbeAcc = from[0] ?? 0;
    this.vbcAcc = from[1] ?? 0;
    this.vbeIter = this.vbeAcc;
    this.vbcIter = this.vbcAcc;
    this.fresh = false;
  }
}

export const npnModel: ModelFactory = (el) => init(new BjtModel(el, 1), el);
export const pnpModel: ModelFactory = (el) => init(new BjtModel(el, -1), el);
