import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ElementModel, ModelFactory, ReadoutSink, SetupContext, SolutionView, Stamper, StepInfo } from "../api";
import { Junction } from "../shared/junction";
import { closeEnough } from "../shared/linearize";
import { init } from "../shared/modelKit";
import { LED_ARRAY_SIZES, ledArrayType } from "./descriptor";

/** CircuitJS1's "default-led" diode model: Is = 93.2 pA, n = 3.73 (series resistance left out). */
const LED_IS = 93.2e-12;
const LED_N = 3.73;
/** Current for full brightness (LEDArrayElm.setColor: 10 mA). */
const I_FULL = 0.01;

/**
 * CircuitJS1 LEDArrayElm: a Shockley LED from each row (anode) to each column
 * (cathode), Newton-linearized like DiodeModel. Readouts b0.. give each LED's
 * brightness 0..1, LED i at column i % cols, row floor(i / cols).
 */
class LedArrayModel implements ElementModel {
  readonly nonlinear = true;
  readonly stateSize: number;
  private nodes: NodeIndex[];
  private readonly j = new Junction();
  private readonly vIter: Float64Array;
  private readonly vAcc: Float64Array;
  private gmin = 0;

  constructor(el: NetlistElement, private readonly cols: number, private readonly rows: number) {
    this.nodes = el.nodes.slice();
    this.stateSize = cols * rows;
    this.vIter = new Float64Array(cols * rows);
    this.vAcc = new Float64Array(cols * rows);
    this.j.setParams(LED_IS, LED_N);
  }

  setup(ctx: SetupContext): void {
    this.nodes = ctx.nodes.slice();
  }

  setProps(): void {}

  initialize(): void {
    this.vIter.fill(0);
    this.vAcc.fill(0);
  }

  private anode = (i: number) => this.nodes[this.cols + Math.floor(i / this.cols)];
  private cathode = (i: number) => this.nodes[i % this.cols];
  private vd = (x: SolutionView, i: number) => x.v(this.anode(i)) - x.v(this.cathode(i));

  stampNewton(s: Stamper, x: SolutionView, step: StepInfo): void {
    this.gmin = step.gmin;
    for (let i = 0; i < this.vIter.length; i++) {
      const a = this.anode(i);
      const k = this.cathode(i);
      if (step.kind === "ac") {
        s.conductance(a, k, this.j.conductance(this.vAcc[i]) + step.gmin);
        continue;
      }
      const v = this.j.limit(this.vd(x, i), this.vIter[i]);
      this.vIter[i] = v;
      const gd = this.j.conductance(v);
      s.conductance(a, k, gd + step.gmin);
      s.current(a, k, this.j.current(v) - gd * v);
    }
  }

  hasConverged(x: SolutionView): boolean {
    for (let i = 0; i < this.vIter.length; i++) if (!closeEnough(this.vd(x, i), this.vIter[i])) return false;
    return true;
  }

  accept(x: SolutionView, _step: StepInfo): void {
    for (let i = 0; i < this.vAcc.length; i++) {
      this.vAcc[i] = this.vd(x, i);
      this.vIter[i] = this.vAcc[i];
    }
  }

  private current(x: SolutionView, i: number): number {
    const v = this.vd(x, i);
    return this.j.current(v) + this.gmin * v;
  }

  readouts(x: SolutionView, out: ReadoutSink): void {
    for (let i = 0; i < this.vAcc.length; i++) out.add(`b${i}`, Math.min(1, Math.max(0, this.current(x, i) / I_FULL)));
  }

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    out.fill(0);
    for (let i = 0; i < this.vAcc.length; i++) {
      const c = this.current(x, i);
      out[this.cols + Math.floor(i / this.cols)] += c;
      out[i % this.cols] -= c;
    }
  }

  saveState(out: Float64Array): void {
    out.set(this.vAcc);
  }

  loadState(from: Float64Array): void {
    this.vAcc.set(from.subarray(0, this.vAcc.length));
    this.vIter.set(this.vAcc);
  }
}

export const LED_ARRAY_MODELS: Record<string, ModelFactory> = Object.fromEntries(
  LED_ARRAY_SIZES.map(([c, r]) => [ledArrayType(c, r), (el: NetlistElement) => init(new LedArrayModel(el, c, r), el)]),
);
