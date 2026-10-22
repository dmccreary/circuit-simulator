// After CircuitJS1's SchmittElm and InvertingSchmittElm (doStep):
// https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/client/SchmittElm.java
// The output is a voltage source to ground at lowLevel or highLevel. The
// hysteresis state changes when a step is accepted (CircuitJS1 decides it
// inside each iteration), which keeps Newton away from flip-flopping when
// the output feeds back to the input. The slew-rate limit (0.5 V/ns by
// default) is not modelled.

import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ElementModel, ModelFactory, ReadoutSink, SetupContext, SolutionView, Stamper, StepInfo, UnknownIndex } from "../api";
import { init } from "../shared/modelKit";
import { num, type Props } from "../shared/props";

class SchmittModel implements ElementModel {
  readonly stateSize = 1;
  private n: NodeIndex[];
  private branch: UnknownIndex = 0;
  private lower = 1.66;
  private upper = 3.33;
  private hi = 5;
  private lo = 0;
  /** Output level is high. */
  private high: boolean;

  constructor(
    el: NetlistElement,
    private readonly inverting: boolean,
  ) {
    this.n = [el.nodes[0] ?? 0, el.nodes[1] ?? 0];
    this.high = !inverting;
  }

  setup(ctx: SetupContext): void {
    this.n = [ctx.nodes[0] ?? 0, ctx.nodes[1] ?? 0];
    this.branch = ctx.allocBranch("out");
  }

  setProps(p: Props): void {
    const a = num(p, "lowerThreshold", 1.66);
    const b = num(p, "upperThreshold", 3.33);
    this.lower = Math.min(a, b);
    this.upper = Math.max(a, b);
    this.hi = num(p, "highLevel", 5);
    this.lo = num(p, "lowLevel", 0);
  }

  /** CircuitJS1 starts the non-inverting part high and the inverting one low. */
  initialize(): void {
    this.high = !this.inverting;
  }

  stampStep(s: Stamper, step: StepInfo): void {
    s.voltageSource(this.branch, this.n[1], 0, (this.high ? this.hi : this.lo) * step.sourceScale);
  }

  accept(x: SolutionView, _step: StepInfo): void {
    const v = x.v(this.n[0]);
    if (this.inverting) {
      if (this.high && v > this.upper) this.high = false;
      else if (!this.high && v < this.lower) this.high = true;
    } else if (this.high && v < this.lower) this.high = false;
    else if (!this.high && v > this.upper) this.high = true;
  }

  readouts(x: SolutionView, out: ReadoutSink): void {
    out.add("vIn", x.v(this.n[0]));
    out.add("vOut", x.v(this.n[1]));
  }

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    out[0] = 0;
    out[1] = x.x(this.branch);
  }

  saveState(o: Float64Array): void {
    o[0] = this.high ? 1 : 0;
  }

  loadState(f: Float64Array): void {
    this.high = f[0] === 1;
  }
}

export const schmittModel: ModelFactory = (el) => init(new SchmittModel(el, false), el);
export const invertingSchmittModel: ModelFactory = (el) => init(new SchmittModel(el, true), el);
