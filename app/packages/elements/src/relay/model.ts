// After CircuitJS1's RelayElm (stamp, startIteration, doStep), with the coil
// integrated by backward Euler as RelayElm does:
// https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/client/RelayElm.java
// The coil is an inductor in series with its resistance (branch current i):
//   V(coil+) - V(coil-) - (R + L/dt)·i = -(L/dt)·i[n-1]
// The armature turns on above onCurrent and off below offCurrent; for
// switchingTime in between both throws are open. Throws open to offResistance.

import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ElementModel, ModelFactory, ReadoutSink, SetupContext, SolutionView, Stamper, StepInfo, UnknownIndex } from "../api";
import { init } from "../shared/modelKit";
import { num, type Props } from "../shared/props";
import { relayPoles } from "./descriptor";

/** 0: off (A closed), 1: on (B closed), 2: moving (both open). */
type Position = 0 | 1 | 2;

class RelayModel implements ElementModel {
  readonly stateSize = 4;
  private n: NodeIndex[];
  private readonly poles: number;
  private branch: UnknownIndex = 0;
  private l = 0.2;
  private r = 20;
  private onI = 0.02;
  private offI = 0.015;
  private swTime = 0.005;
  private ron = 0.05;
  private roff = 1e6;
  private iPrev = 0;
  private on = false;
  private position: Position = 0;
  private settleAt = 0;

  constructor(el: NetlistElement) {
    this.n = el.nodes.slice();
    this.poles = relayPoles(el.type);
  }

  setup(ctx: SetupContext): void {
    this.n = ctx.nodes.slice();
    this.branch = ctx.allocBranch("coil");
  }

  setProps(p: Props): void {
    this.l = Math.max(1e-12, num(p, "coilInductance", 0.2));
    this.r = Math.max(1e-6, num(p, "coilResistance", 20));
    this.onI = Math.max(0, num(p, "onCurrent", 0.02));
    this.offI = Math.max(0, num(p, "offCurrent", this.onI * 0.75));
    this.swTime = Math.max(0, num(p, "switchingTime", 0.005));
    this.ron = Math.max(1e-6, num(p, "onResistance", 0.05));
    this.roff = Math.max(1, num(p, "offResistance", 1e6));
  }

  initialize(): void {
    this.iPrev = 0;
    this.on = false;
    this.position = 0;
    this.settleAt = 0;
  }

  private get c1(): NodeIndex {
    return this.n[3 * this.poles];
  }

  private get c2(): NodeIndex {
    return this.n[3 * this.poles + 1];
  }

  stampStep(s: Stamper, step: StepInfo): void {
    const transient = step.kind === "transient" && step.dt > 0;
    const req = transient ? this.l / step.dt : 0;
    s.voltageSource(this.branch, this.c1, this.c2, transient ? -req * this.iPrev : 0);
    s.matrix(this.branch, this.branch, -(req + this.r));
    for (let p = 0; p < this.poles; p++) {
      const [c, a, b] = [this.n[3 * p], this.n[3 * p + 1], this.n[3 * p + 2]];
      s.conductance(c, a, 1 / (this.position === 0 ? this.ron : this.roff));
      s.conductance(c, b, 1 / (this.position === 1 ? this.ron : this.roff));
    }
  }

  accept(x: SolutionView, step: StepInfo): void {
    this.iPrev = x.x(this.branch);
    const abs = Math.abs(this.iPrev);
    if (this.on && abs < this.offI) this.begin(false, step.t);
    else if (!this.on && abs > this.onI) this.begin(true, step.t);
    else if (this.position === 2 && step.t >= this.settleAt) this.position = this.on ? 1 : 0;
  }

  private begin(on: boolean, t: number): void {
    this.on = on;
    if (this.swTime > 0) {
      this.position = 2;
      this.settleAt = t + this.swTime;
    } else this.position = on ? 1 : 0;
  }

  breakpoints(t0: number, t1: number, out: number[]): void {
    if (this.position === 2 && this.settleAt > t0 && this.settleAt <= t1) out.push(this.settleAt);
  }

  readouts(x: SolutionView, out: ReadoutSink): void {
    out.add("position", this.position === 2 ? 0.5 : this.position);
    out.add("coilCurrent", x.x(this.branch));
  }

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    out.fill(0);
    for (let p = 0; p < this.poles; p++) {
      const [c, a, b] = [this.n[3 * p], this.n[3 * p + 1], this.n[3 * p + 2]];
      const ia = (x.v(c) - x.v(a)) / (this.position === 0 ? this.ron : this.roff);
      const ib = (x.v(c) - x.v(b)) / (this.position === 1 ? this.ron : this.roff);
      out[3 * p] = ia + ib;
      out[3 * p + 1] = -ia;
      out[3 * p + 2] = -ib;
    }
    const i = x.x(this.branch);
    out[3 * this.poles] = i;
    out[3 * this.poles + 1] = -i;
  }

  saveState(o: Float64Array): void {
    o[0] = this.iPrev;
    o[1] = this.on ? 1 : 0;
    o[2] = this.position;
    o[3] = this.settleAt;
  }

  loadState(f: Float64Array): void {
    this.iPrev = f[0];
    this.on = f[1] === 1;
    this.position = (f[2] === 1 ? 1 : f[2] === 2 ? 2 : 0) as Position;
    this.settleAt = f[3];
  }
}

export const relayModel: ModelFactory = (el) => init(new RelayModel(el), el);
