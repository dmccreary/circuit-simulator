// The Norton amp's "+" input: a diode to ground whose current is mirrored out
// of the "-" input (NortonAmpElm's diode at node 2 sensed by its CCCS, folded
// into one model so no internal node is needed). Terminals: anode, cathode,
// mirror in (the current is drawn into it), mirror out.

import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ComplexStamper, ElementModel, ModelFactory, ReadoutSink, SetupContext, SolutionView, Stamper, StepInfo } from "../api";
import { Junction } from "../shared/junction";
import { closeEnough } from "../shared/linearize";
import { init } from "../shared/modelKit";

class MirroredDiodeModel implements ElementModel {
  readonly nonlinear = true;
  readonly stateSize = 1;
  private n: NodeIndex[];
  private j = new Junction();
  private vIter = 0;
  private vAcc = 0;
  private gmin = 0;

  constructor(el: NetlistElement) {
    this.n = [0, 1, 2, 3].map((k) => el.nodes[k] ?? 0);
    this.j.setParams(1e-14, 1);
  }

  setup(ctx: SetupContext): void {
    this.n = [0, 1, 2, 3].map((k) => ctx.nodes[k] ?? 0);
  }

  setProps(): void {}

  initialize(): void {
    this.vIter = this.vAcc = 0;
  }

  private v(x: SolutionView): number {
    return x.v(this.n[0]) - x.v(this.n[1]);
  }

  /** Diode a-b plus the same current, as a VCCS on V(a)-V(b), from c to d. */
  private stampAt(s: Stamper, v: number, gmin: number, withRhs: boolean): void {
    const [a, b, c, d] = this.n;
    const id = this.j.current(v) + gmin * v;
    const gd = this.j.conductance(v) + gmin;
    s.conductance(a, b, gd);
    s.matrix(c, a, gd);
    s.matrix(c, b, -gd);
    s.matrix(d, a, -gd);
    s.matrix(d, b, gd);
    if (withRhs) {
      s.current(a, b, id - gd * v);
      s.current(c, d, id - gd * v);
    }
  }

  stampNewton(s: Stamper, x: SolutionView, step: StepInfo): void {
    this.gmin = step.gmin;
    if (step.kind === "ac") {
      this.stampAt(s, this.vAcc, step.gmin, false);
      return;
    }
    this.vIter = this.j.limit(this.v(x), this.vIter);
    this.stampAt(s, this.vIter, step.gmin, true);
  }

  stampAC(s: ComplexStamper, op: SolutionView): void {
    const [a, b, c, d] = this.n;
    const g = this.j.conductance(this.v(op)) + this.gmin;
    s.admittance(a, b, g, 0);
    s.matrix(c, a, g, 0);
    s.matrix(c, b, -g, 0);
    s.matrix(d, a, -g, 0);
    s.matrix(d, b, g, 0);
  }

  hasConverged(x: SolutionView): boolean {
    return closeEnough(this.v(x), this.vIter);
  }

  accept(x: SolutionView, _step: StepInfo): void {
    this.vAcc = this.vIter = this.v(x);
  }

  readouts(_x: SolutionView, _out: ReadoutSink): void {}

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    const v = this.v(x);
    const i = this.j.current(v) + this.gmin * v;
    out[0] = i;
    out[1] = -i;
    out[2] = i;
    out[3] = -i;
  }

  saveState(o: Float64Array): void {
    o[0] = this.vAcc;
  }

  loadState(f: Float64Array): void {
    this.vAcc = this.vIter = f[0] ?? 0;
  }
}

export const mirroredDiodeModel: ModelFactory = (el) => init(new MirroredDiodeModel(el), el);
