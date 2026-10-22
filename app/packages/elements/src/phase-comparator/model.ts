// After CircuitJS1's PhaseCompElm (startIteration, doStep):
// https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/client/PhaseCompElm.java
// Edges are detected between steps, as startIteration does: an input reads
// high above supply/2. ff1 drives the output to the supply, ff2 to 0 V; with
// neither set the output source is replaced by an open circuit (i = 0).

import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ElementModel, ModelFactory, ReadoutSink, SetupContext, SolutionView, Stamper, StepInfo, UnknownIndex } from "../api";
import { init } from "../shared/modelKit";
import { num, type Props } from "../shared/props";

class PhaseComparatorModel implements ElementModel {
  readonly stateSize = 4;
  private n: NodeIndex[];
  private branch: UnknownIndex = 0;
  private hv = 5;
  private ff1 = false;
  private ff2 = false;
  private in1 = false;
  private in2 = false;

  constructor(el: NetlistElement) {
    this.n = [0, 1, 2].map((k) => el.nodes[k] ?? 0);
  }

  setup(ctx: SetupContext): void {
    this.n = [0, 1, 2].map((k) => ctx.nodes[k] ?? 0);
    this.branch = ctx.allocBranch("out");
  }

  setProps(p: Props): void {
    this.hv = num(p, "supply", 5);
  }

  initialize(): void {
    this.ff1 = this.ff2 = this.in1 = this.in2 = false;
  }

  stampStep(s: Stamper, step: StepInfo): void {
    if (this.ff1 || this.ff2) s.voltageSource(this.branch, this.n[2], 0, this.ff1 ? this.hv * step.sourceScale : 0);
    else s.matrix(this.branch, this.branch, 1);
  }

  accept(x: SolutionView, _step: StepInfo): void {
    const th = this.hv / 2;
    const v1 = x.v(this.n[0]) > th;
    const v2 = x.v(this.n[1]) > th;
    if (v1 && !this.in1) this.ff1 = true;
    if (v2 && !this.in2) this.ff2 = true;
    if (this.ff1 && this.ff2) this.ff1 = this.ff2 = false;
    this.in1 = v1;
    this.in2 = v2;
  }

  readouts(_x: SolutionView, out: ReadoutSink): void {
    out.add("state", this.ff1 ? 1 : this.ff2 ? -1 : 0);
  }

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    out[0] = 0;
    out[1] = 0;
    out[2] = this.ff1 || this.ff2 ? x.x(this.branch) : 0;
  }

  saveState(o: Float64Array): void {
    o[0] = this.ff1 ? 1 : 0;
    o[1] = this.ff2 ? 1 : 0;
    o[2] = this.in1 ? 1 : 0;
    o[3] = this.in2 ? 1 : 0;
  }

  loadState(f: Float64Array): void {
    this.ff1 = f[0] === 1;
    this.ff2 = f[1] === 1;
    this.in1 = f[2] === 1;
    this.in2 = f[3] === 1;
  }
}

export const phaseComparatorModel: ModelFactory = (el) => init(new PhaseComparatorModel(el), el);
