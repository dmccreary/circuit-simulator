import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ElementModel, ReadoutSink, SetupContext, SolutionView, Stamper } from "../api";

/** Input leakage of display parts: high impedance, but never a floating node. */
const G_LEAK = 1e-9;

/**
 * Model for parts that only look at their terminal voltages (displays): each
 * terminal leaks 1 nS to ground, and readouts report the voltages as v0, v1...
 */
export class SensingModel implements ElementModel {
  readonly stateSize = 0;
  private n: NodeIndex[];

  constructor(el: NetlistElement) {
    this.n = el.nodes.slice();
  }

  setup(ctx: SetupContext): void {
    this.n = ctx.nodes.slice();
  }

  setProps(): void {}

  stampStatic(s: Stamper): void {
    for (const node of this.n) s.conductance(node, 0, G_LEAK);
  }

  accept(): void {}

  readouts(x: SolutionView, out: ReadoutSink): void {
    this.n.forEach((node, i) => out.add(`v${i}`, x.v(node)));
  }

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    this.n.forEach((node, i) => (out[i] = x.v(node) * G_LEAK));
  }

  saveState(): void {}
  loadState(): void {}
}
