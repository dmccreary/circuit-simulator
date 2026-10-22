import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ElementModel, ModelFactory, ReadoutSink, SetupContext, SolutionView, StepInfo, Stamper } from "../api";
import { DiodePath, INTERNAL_SHUNT } from "../shared/diodePath";
import { closeEnough, stampLinearized } from "../shared/linearize";
import { init } from "../shared/modelKit";
import type { Props } from "../shared/props";

// UnijunctionElm's composite (ujtModelString / ujtModelDump), with x = internal nodes:
//   DiodeElm E-x5 (model x2n2646-emitter: Is 2.13e-11, n 1.8), ResistorElm B2-x5 2518 Ω,
//   ResistorElm x7-B1 38.15 Ω, and a VCCS x5->x7 of (V5 - V7)·(0.00028 + 0.00575·1000·Ie),
//   the emitter current Ie sensed by a 0 V source and a 1000 V/A CCVS (conductivity modulation).
// The model's 35 pF capacitor across x5-x7 is left out: its nanosecond time constant would force
// steps far shorter than any external timing, and it only shapes the switching edge.
const EMITTER_IS = 2.13e-11;
const EMITTER_N = 1.8;
const R_B2 = 2518;
const R_B1 = 38.15;
const G0 = 0.00028;
const K_MOD = 0.00575 * 1000;

/** Terminals E (0), B1 (1), B2 (2); internal nodes x5 and x7 are extra unknowns. */
class UnijunctionModel implements ElementModel {
  readonly nonlinear = true;
  readonly stateSize = 2;
  private nodes: NodeIndex[];
  private x5: NodeIndex = 0;
  private x7: NodeIndex = 0;
  private diode = new DiodePath(EMITTER_IS, EMITTER_N);
  private c2 = 0;
  private gmin = 0;

  constructor(el: NetlistElement) {
    this.nodes = [...el.nodes];
  }

  setup(ctx: SetupContext): void {
    this.nodes = [...ctx.nodes];
    this.x5 = ctx.allocBranch("x5");
    this.x7 = ctx.allocBranch("x7");
  }

  setProps(_p: Props): void {}

  initialize(): void {
    this.diode.vIter = 0;
    this.c2 = 0;
  }

  stampStep(s: Stamper, _step: StepInfo): void {
    const [, b1, b2] = this.nodes;
    s.conductance(b2, this.x5, 1 / R_B2);
    s.conductance(this.x7, b1, 1 / R_B1);
    s.matrix(this.x5, this.x5, INTERNAL_SHUNT);
    s.matrix(this.x7, this.x7, INTERNAL_SHUNT);
  }

  stampNewton(s: Stamper, x: SolutionView, step: StepInfo): void {
    this.gmin = step.gmin;
    const e = this.nodes[0];
    const j = this.diode.junction;
    const c1 = j.limit(x.v(e) - x.x(this.x5), this.diode.vIter);
    this.diode.vIter = c1;
    const c2 = x.x(this.x5) - x.x(this.x7);
    this.c2 = c2;
    const id = j.current(c1);
    const gd = j.conductance(c1) + step.gmin;
    const on = id > 0;
    const g57 = G0 + (on ? K_MOD * id : 0);
    const ie = id + step.gmin * c1;
    const i57 = g57 * c2;
    // The modulated conductance is linearized with Ie held at this iterate (a chord step):
    // its full derivative K·gd·c2 makes Newton cycle through the negative-resistance region.
    stampLinearized(
      s,
      [e, this.x5, this.x7],
      [
        { plus: e, minus: this.x5 },
        { plus: this.x5, minus: this.x7 },
      ],
      [c1, c2],
      [ie, -ie + i57, -i57],
      [
        [gd, 0],
        [-gd, g57],
        [0, -g57],
      ],
      step.kind === "ac",
    );
  }

  hasConverged(x: SolutionView): boolean {
    return (
      this.diode.converged(x, this.nodes[0], this.x5) && closeEnough(x.x(this.x5) - x.x(this.x7), this.c2)
    );
  }

  accept(x: SolutionView): void {
    this.diode.accept(x, this.nodes[0], this.x5);
    this.c2 = x.x(this.x5) - x.x(this.x7);
  }

  private currents(x: SolutionView): [number, number, number] {
    const [e, , b2] = this.nodes;
    const ie = this.diode.current(x, e, this.x5, this.gmin);
    const ib2 = (x.v(b2) - x.x(this.x5)) / R_B2;
    return [ie, -ie - ib2, ib2];
  }

  readouts(x: SolutionView, out: ReadoutSink): void {
    const [ie, ib1, ib2] = this.currents(x);
    const [e, b1, b2] = this.nodes;
    out.add("ie", ie);
    out.add("ib1", -ib1);
    out.add("ib2", ib2);
    out.add("veb1", x.v(e) - x.v(b1));
    out.add("power", ie * (x.v(e) - x.v(b1)) + ib2 * (x.v(b2) - x.v(b1)));
  }

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    const [ie, ib1, ib2] = this.currents(x);
    out[0] = ie;
    out[1] = ib1;
    out[2] = ib2;
  }

  saveState(out: Float64Array): void {
    out[0] = this.diode.vIter;
    out[1] = this.c2;
  }

  loadState(from: Float64Array): void {
    this.diode.vIter = from[0] ?? 0;
    this.c2 = from[1] ?? 0;
  }
}

export const unijunctionModel: ModelFactory = (el) => init(new UnijunctionModel(el), el);
