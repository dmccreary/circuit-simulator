// CircuitJS1 CC2Elm.stamp(): V(X) = V(Y) through a branch, and Z sinks gain·I(X).
// https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/client/CC2Elm.java

import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ElementModel, ModelFactory, ReadoutSink, SetupContext, SolutionView, Stamper, UnknownIndex } from "../api";
import { init } from "../shared/modelKit";
import { num, type Props } from "../shared/props";

class CurrentConveyorModel implements ElementModel {
  readonly stateSize = 0;
  private n: NodeIndex[];
  private br: UnknownIndex = 0;
  private gain = 1;

  constructor(el: NetlistElement) {
    this.n = el.nodes.slice();
  }

  setup(ctx: SetupContext): void {
    this.n = ctx.nodes.slice();
    this.br = ctx.allocBranch("x");
  }

  setProps(p: Props): void {
    this.gain = num(p, "gain", 1);
  }

  /** x[br] is the current into X; KCL at Z gets gain·x[br] leaving through the part. */
  stampStatic(s: Stamper): void {
    const [x, y, z] = this.n;
    s.voltageSource(this.br, x, 0, 0);
    s.matrix(this.br, y, -1);
    s.matrix(z, this.br, this.gain);
  }

  accept(): void {}

  readouts(x: SolutionView, out: ReadoutSink): void {
    out.add("vx", x.v(this.n[0]));
    out.add("ix", x.x(this.br));
    out.add("iz", this.gain * x.x(this.br));
  }

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    const i = x.x(this.br);
    out[0] = i;
    out[1] = 0;
    out[2] = this.gain * i;
  }

  saveState(): void {}
  loadState(): void {}
}

export const currentConveyorModel: ModelFactory = (el) => init(new CurrentConveyorModel(el), el);
