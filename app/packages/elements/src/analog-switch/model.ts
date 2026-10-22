// After CircuitJS1's AnalogSwitchElm and AnalogSwitch2Elm (stamp, doStep):
// https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/client/AnalogSwitchElm.java
// The control is read from each accepted solution and applies to the next step.

import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ElementModel, ModelFactory, ReadoutSink, SetupContext, SolutionView, Stamper, StepInfo } from "../api";
import { init } from "../shared/modelKit";
import { bool, num, type Props } from "../shared/props";

class AnalogSwitchModel implements ElementModel {
  readonly stateSize = 1;
  private n: NodeIndex[];
  private closed = false;
  private threshold = 2.5;
  private ron = 20;
  private roff = 1e10;
  private invert = false;
  private pulldown = false;

  constructor(
    el: NetlistElement,
    private readonly double: boolean,
  ) {
    this.n = el.nodes.slice();
  }

  setup(ctx: SetupContext): void {
    this.n = ctx.nodes.slice();
  }

  setProps(p: Props): void {
    this.threshold = num(p, "threshold", 2.5);
    this.ron = Math.max(1e-6, num(p, "onResistance", 20));
    this.roff = Math.max(1, num(p, "offResistance", 1e10));
    this.invert = bool(p, "invert", false);
    this.pulldown = bool(p, "pulldown", false);
  }

  initialize(): void {
    this.closed = this.invert;
  }

  private get ctl(): NodeIndex {
    return this.n[this.double ? 3 : 2];
  }

  /** [terminal, conductance] for each contact from terminal 0. */
  private contacts(): [number, number][] {
    const on = 1 / this.ron;
    const off = this.pulldown ? 0 : 1 / this.roff;
    if (!this.double) return [[1, this.closed ? on : off]];
    return [
      [1, this.closed ? on : off],
      [2, this.closed ? off : on],
    ];
  }

  stampStatic(s: Stamper): void {
    if (!this.pulldown) return;
    const sides = this.double ? [0, 1, 2] : [0, 1];
    for (const k of sides) s.conductance(this.n[k], 0, 1 / this.roff);
  }

  stampStep(s: Stamper, _step: StepInfo): void {
    for (const [k, g] of this.contacts()) if (g > 0) s.conductance(this.n[0], this.n[k], g);
  }

  accept(x: SolutionView): void {
    const high = x.v(this.ctl) >= this.threshold;
    this.closed = high !== this.invert;
  }

  readouts(x: SolutionView, out: ReadoutSink): void {
    out.add("closed", this.closed ? 1 : 0);
    const [k, g] = this.contacts().reduce((a, b) => (b[1] > a[1] ? b : a));
    out.add("current", (x.v(this.n[0]) - x.v(this.n[k])) * g);
  }

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    out.fill(0);
    for (const [k, g] of this.contacts()) {
      const i = (x.v(this.n[0]) - x.v(this.n[k])) * g;
      out[0] += i;
      out[k] -= i;
    }
    if (this.pulldown) {
      const sides = this.double ? [0, 1, 2] : [0, 1];
      for (const k of sides) out[k] += x.v(this.n[k]) / this.roff;
    }
  }

  saveState(o: Float64Array): void {
    o[0] = this.closed ? 1 : 0;
  }

  loadState(f: Float64Array): void {
    this.closed = f[0] === 1;
  }
}

export const analogSwitchModel: ModelFactory = (el) => init(new AnalogSwitchModel(el, false), el);
export const analogSwitch2Model: ModelFactory = (el) => init(new AnalogSwitchModel(el, true), el);
