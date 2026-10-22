// Behavior follows CircuitJS1's TimerElm (stamp, startIteration, doStep):
// https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/client/TimerElm.java
// A 5k/10k divider holds ctl at 2/3 Vcc. Each accepted step re-evaluates the
// comparators from its solution: threshold above ctl clears the output, trigger
// below ctl/2 sets it, reset below 0.7 V clears it. The output is 1 Ω to Vcc or
// ground; while low, discharge is 10 Ω to ground.

import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ElementModel, ModelFactory, ReadoutSink, SetupContext, SolutionView, Stamper, StepInfo } from "../api";
import { init } from "../shared/modelKit";
import { T555 } from "./descriptor";

const R_DIV_HI = 5000;
const R_DIV_LO = 10000;
const R_DIS = 10;
const R_OUT = 1;
/** Leakage of the off discharge transistor, so an unconnected dis pin is never a floating node. */
const R_DIS_OFF = 1e9;

/**
 * The comparators act on accepted steps, so a step that jumps past a threshold
 * switches late. The model therefore asks for a breakpoint where the last two
 * accepted steps say the threshold or trigger margin will reach zero; as the
 * crossing nears, the steps land on it (simulation-engine.md §2.3).
 */
const LAND_PAST = 1e-6;
const PAST_VOLTS = 1e-6;
/** Length of the slope-finding first steps, as a fraction of the step the engine proposed. */
const FIRST_STEPS = 1e-3;

class Timer555Model implements ElementModel {
  readonly stateSize = 8;
  private n: NodeIndex[];
  private out = false;
  private triggerSuppressed = false;
  /** Comparator margins (threshold - ctl, trigger - ctl/2) at the last two accepted steps. */
  private hist = [-1, 0, 0, -1, 0, 0];

  constructor(el: NetlistElement) {
    this.n = el.nodes.slice();
  }

  setup(ctx: SetupContext): void {
    this.n = ctx.nodes.slice();
  }

  setProps(): void {}

  initialize(): void {
    this.out = false;
    this.triggerSuppressed = false;
    this.hist = [-1, 0, 0, -1, 0, 0];
  }

  stampStatic(s: Stamper): void {
    s.conductance(this.n[T555.vcc], this.n[T555.ctl], 1 / R_DIV_HI);
    s.conductance(this.n[T555.ctl], this.n[T555.gnd], 1 / R_DIV_LO);
  }

  stampStep(s: Stamper, _step: StepInfo): void {
    const gnd = this.n[T555.gnd];
    s.conductance(this.n[T555.dis], gnd, 1 / (this.out ? R_DIS_OFF : R_DIS));
    s.conductance(this.out ? this.n[T555.vcc] : gnd, this.n[T555.out], 1 / R_OUT);
  }

  /** Predicted comparator crossings in (t0, t1], from the last two accepted margins. */
  breakpoints(t0: number, t1: number, out: number[]): void {
    const [ta, thrA, trigA, tb, thrB, trigB] = this.hist;
    if (!(ta >= 0 && tb > ta)) {
      // No slope yet (the first steps, or after a reset): take two short steps to get one,
      // so the first ramp cannot jump past a threshold in a single long step.
      out.push(t0 + FIRST_STEPS * (t1 - t0));
      return;
    }
    for (const [a, b] of [[thrA, thrB], [trigA, trigB]]) {
      const slope = (b - a) / (tb - ta);
      if (b === 0 || slope === 0 || Math.sign(b) === Math.sign(slope)) continue; // not approaching zero
      const tc = tb - b / slope;
      // Just past: by a sliver of a step, and by at least PAST_VOLTS of margin.
      const land = Math.max(tc, tb) + Math.max(LAND_PAST * (tb - ta), PAST_VOLTS / Math.abs(slope));
      if (land > t0 && land <= t1) out.push(land);
    }
  }

  /** TimerElm.startIteration(), evaluated on the accepted solution for the next step. */
  accept(x: SolutionView, step?: StepInfo): void {
    const v = (pin: number) => x.v(this.n[pin]);
    const g = v(T555.gnd);
    if (step && step.kind === "transient") {
      const h = this.hist;
      const thr = v(T555.thres) - v(T555.ctl);
      const trig = v(T555.trig) - (v(T555.ctl) + g) / 2;
      if (step.t > h[3]) this.hist = [h[3], h[4], h[5], step.t, thr, trig];
      else if (step.t < h[3]) this.hist = [-1, 0, 0, step.t, thr, trig]; // time went back (a reset): start over
    }
    let out = v(T555.out) > (v(T555.vcc) + g) / 2;
    if (v(T555.thres) > v(T555.ctl)) out = false;
    const triggered = (v(T555.ctl) + g) / 2 > v(T555.trig);
    if (triggered || this.triggerSuppressed) out = true;
    if (v(T555.rst) < 0.7 + g) {
      out = false;
      this.triggerSuppressed = triggered;
    } else this.triggerSuppressed = false;
    this.out = out;
  }

  readouts(x: SolutionView, out: ReadoutSink): void {
    out.add("output", this.out ? 1 : 0);
    out.add("vOut", x.v(this.n[T555.out]) - x.v(this.n[T555.gnd]));
    out.add("vCtl", x.v(this.n[T555.ctl]) - x.v(this.n[T555.gnd]));
  }

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    const v = (pin: number) => x.v(this.n[pin]);
    const g = v(T555.gnd);
    out.fill(0);
    const iDiv = (v(T555.vcc) - v(T555.ctl)) / R_DIV_HI;
    const iLo = (v(T555.ctl) - g) / R_DIV_LO;
    out[T555.vcc] = iDiv;
    out[T555.ctl] = iLo - iDiv;
    out[T555.gnd] = -iLo;
    const iDis = (v(T555.dis) - g) / (this.out ? R_DIS_OFF : R_DIS);
    out[T555.dis] = iDis;
    out[T555.gnd] -= iDis;
    const iOut = (v(T555.out) - (this.out ? v(T555.vcc) : g)) / R_OUT;
    out[T555.out] = iOut;
    if (this.out) out[T555.vcc] -= iOut;
    else out[T555.gnd] -= iOut;
  }

  saveState(o: Float64Array): void {
    o[0] = this.out ? 1 : 0;
    o[1] = this.triggerSuppressed ? 1 : 0;
    o.set(this.hist, 2);
  }

  loadState(f: Float64Array): void {
    this.out = f[0] === 1;
    this.triggerSuppressed = f[1] === 1;
    if (f.length >= 8) this.hist = Array.from(f.subarray(2, 8));
  }
}

export const timer555Model: ModelFactory = (el) => init(new Timer555Model(el), el);
