import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ElementModel, ModelFactory, ReadoutSink, SetupContext, SolutionView, Stamper, StepInfo } from "../api";
import { init } from "../shared/modelKit";
import type { Props } from "../shared/props";
import { spdtSelected } from "./descriptor";

/** Closed and open contact resistances. */
const R_CLOSED = 1e-3;
// 1 GΩ rather than R_OPEN: a node reached only through open throws (a 3-way
// switch's idle traveller) must stay solvable next to the closed contacts.
const R_OFF = 1e9;

/** Each throw is a resistor from the common terminal: R_CLOSED when selected, else R_OFF. */
class SpdtSwitchModel implements ElementModel {
  readonly stateSize = 0;
  private nodes: NodeIndex[];
  private selected: 1 | 2 = 1;

  constructor(el: NetlistElement) {
    this.nodes = el.nodes.slice();
  }

  setup(ctx: SetupContext): void {
    this.nodes = ctx.nodes.slice();
  }

  setProps(p: Props): void {
    this.selected = spdtSelected(p);
  }

  private g(throwPin: 1 | 2): number {
    return throwPin === this.selected ? 1 / R_CLOSED : 1 / R_OFF;
  }

  stampStatic(s: Stamper): void {
    s.conductance(this.nodes[0], this.nodes[1], this.g(1));
    s.conductance(this.nodes[0], this.nodes[2], this.g(2));
  }

  accept(_x: SolutionView, _step: StepInfo): void {}

  private through(x: SolutionView, pin: 1 | 2): number {
    if (this.nodes[0] === this.nodes[pin]) return 0;
    return (x.v(this.nodes[0]) - x.v(this.nodes[pin])) * this.g(pin);
  }

  readouts(x: SolutionView, out: ReadoutSink): void {
    out.add("position", this.selected === 2 ? 1 : 0);
    out.add("current", this.through(x, this.selected));
  }

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    const ia = this.through(x, 1);
    const ib = this.through(x, 2);
    out[0] = ia + ib;
    out[1] = -ia;
    out[2] = -ib;
  }

  saveState(): void {}
  loadState(): void {}
}

export const spdtSwitchModel: ModelFactory = (el) => init(new SpdtSwitchModel(el), el);
