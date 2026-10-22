// After CircuitJS1's RelayContactElm (doStep: r_on when closed, else r_off).
// https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/client/RelayContactElm.java
// CircuitJS1's coil sets its contacts' positions directly; here the coil
// drives a net that the contact reads (see ../relay-coil/descriptor.ts).
// The arm voltage is read inside Newton, so the contact follows the coil in
// the same step: above ARM_HIGH energized, below ARM_LOW released, else held.

import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ElementModel, ModelFactory, ReadoutSink, SetupContext, SolutionView, Stamper, StepInfo } from "../api";
import { init } from "../shared/modelKit";
import { bool, num, type Props } from "../shared/props";

const ARM_HIGH = 0.65;
const ARM_LOW = 0.35;

class RelayContactModel implements ElementModel {
  readonly stateSize = 1;
  readonly nonlinear = true;
  private n: NodeIndex[];
  private ron = 0.05;
  private roff = 1e6;
  private nc = false;
  private startEnergized = false;
  /** Accepted armature state, and the one used by the latest Newton stamp. */
  private energized = false;
  private energizedIter = false;

  constructor(el: NetlistElement) {
    this.n = [0, 1, 2].map((k) => el.nodes[k] ?? 0);
  }

  setup(ctx: SetupContext): void {
    this.n = [0, 1, 2].map((k) => ctx.nodes[k] ?? 0);
  }

  setProps(p: Props): void {
    this.ron = Math.max(1e-6, num(p, "onResistance", 0.05));
    this.roff = Math.max(1, num(p, "offResistance", 1e6));
    this.nc = bool(p, "normallyClosed", false);
    this.startEnergized = bool(p, "initiallyEnergized", false);
  }

  initialize(): void {
    this.energized = this.energizedIter = this.startEnergized;
  }

  private decide(x: SolutionView): boolean {
    const v = x.v(this.n[2]);
    return v > ARM_HIGH ? true : v < ARM_LOW ? false : this.energized;
  }

  private closed(energized: boolean): boolean {
    return energized !== this.nc;
  }

  stampNewton(s: Stamper, x: SolutionView, step: StepInfo): void {
    if (step.kind !== "ac") this.energizedIter = this.decide(x);
    s.conductance(this.n[0], this.n[1], 1 / (this.closed(this.energizedIter) ? this.ron : this.roff));
  }

  hasConverged(x: SolutionView, _previous: SolutionView): boolean {
    return this.decide(x) === this.energizedIter;
  }

  accept(x: SolutionView, _step: StepInfo): void {
    this.energized = this.energizedIter = this.decide(x);
  }

  private current(x: SolutionView): number {
    return (x.v(this.n[0]) - x.v(this.n[1])) / (this.closed(this.energizedIter) ? this.ron : this.roff);
  }

  readouts(x: SolutionView, out: ReadoutSink): void {
    out.add("closed", this.closed(this.energized) ? 1 : 0);
    out.add("current", this.current(x));
  }

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    const i = this.current(x);
    out[0] = i;
    out[1] = -i;
    out[2] = 0;
  }

  saveState(o: Float64Array): void {
    o[0] = this.energized ? 1 : 0;
  }

  loadState(f: Float64Array): void {
    this.energized = this.energizedIter = f[0] === 1;
  }
}

export const relayContactModel: ModelFactory = (el) => init(new RelayContactModel(el), el);
