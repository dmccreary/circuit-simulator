// After CircuitJS1's RelayCoilElm (stamp, startIteration):
// https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/client/RelayCoilElm.java
// The coil is an inductor in series with its resistance, integrated by
// backward Euler (branch current i):  V(+) - V(-) - (R + L/dt)·i = -(L/dt)·i[n-1].
// The armature follows a 1 ms average of |i| through RelayCoilElm's states:
//   0 off -> 1 pulling in (onCurrent exceeded, waits switchingTimeOn) -> 2 on
//   -> 3 releasing (below offCurrent, waits switchingTimeOff) -> 0.
// The resulting switch position drives the "arm" terminal (see descriptor.ts).

import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ElementModel, ModelFactory, ReadoutSink, SetupContext, SolutionView, Stamper, StepInfo, UnknownIndex } from "../api";
import { exp } from "../shared/math";
import { init } from "../shared/modelKit";
import { bool, num, str, type Props } from "../shared/props";
import { RELAY_COIL_TYPES } from "./descriptor";

const NORMAL = 0;
const ON_DELAY = 1;
const OFF_DELAY = 2;
const LATCHING = 3;
const LATCHING_ON = 4;
const LATCHING_OFF = 5;

/** Conductance of the "arm" drive, siemens. */
const ARM_G = 1e-3;
/** Slack for landing on a switching-time breakpoint. */
const EPS_T = 1e-12;

class RelayCoilModel implements ElementModel {
  readonly stateSize = 5;
  private n: NodeIndex[];
  private branch: UnknownIndex = 0;
  private type = NORMAL;
  private l = 0.2;
  private r = 20;
  private onI = 0.02;
  private offI = 0.015;
  private swTime = 0.005;
  private startOn = false;
  // state
  private iPrev = 0;
  private avg = 0;
  private state = 0;
  private position = 0;
  private lastTransition = 0;

  constructor(el: NetlistElement) {
    this.n = [0, 1, 2].map((k) => el.nodes[k] ?? 0);
  }

  setup(ctx: SetupContext): void {
    this.n = [0, 1, 2].map((k) => ctx.nodes[k] ?? 0);
    this.branch = ctx.allocBranch("coil");
  }

  setProps(p: Props): void {
    this.type = Math.max(0, RELAY_COIL_TYPES.indexOf(str(p, "coilType", "normal")));
    this.l = Math.max(1e-12, num(p, "coilInductance", 0.2));
    this.r = Math.max(1e-6, num(p, "coilResistance", 20));
    this.onI = Math.max(0, num(p, "onCurrent", 0.02));
    this.offI = Math.max(0, num(p, "offCurrent", this.onI * 0.75));
    this.swTime = Math.max(0, num(p, "switchingTime", 0.005));
    this.startOn = bool(p, "initiallyOn", false);
  }

  initialize(): void {
    this.iPrev = this.avg = this.lastTransition = 0;
    this.state = 0;
    this.position = this.startOn ? 1 : 0;
  }

  private get swOn(): number {
    return this.type === OFF_DELAY ? 0 : this.swTime;
  }

  private get swOff(): number {
    return this.type === ON_DELAY ? 0 : this.swTime;
  }

  /** Voltage the "arm" terminal is driven to. */
  private arm(): number {
    if (this.type === LATCHING_ON || this.type === LATCHING_OFF) {
      if (this.state !== 2) return 0.5; // idle: contacts hold
      return this.type === LATCHING_ON ? 1 : 0;
    }
    return this.position;
  }

  stampStep(s: Stamper, step: StepInfo): void {
    const [c1, c2, arm] = this.n;
    const transient = step.kind === "transient" && step.dt > 0;
    const req = transient ? this.l / step.dt : 0;
    s.voltageSource(this.branch, c1, c2, transient ? -req * this.iPrev : 0);
    s.matrix(this.branch, this.branch, -(req + this.r));
    s.conductance(arm, 0, ARM_G);
    s.current(0, arm, ARM_G * this.arm());
  }

  accept(x: SolutionView, step: StepInfo): void {
    this.iPrev = x.x(this.branch);
    if (step.kind !== "transient" || !(step.dt > 0)) return;
    const a = exp(-step.dt * 1e3);
    this.avg = a * this.avg + (1 - a) * Math.abs(this.iPrev);
    const t = step.t;
    if (this.state === 0) {
      if (this.avg > this.onI) {
        this.lastTransition = t;
        this.state = 1;
      }
    } else if (this.state === 1) {
      if (this.avg < this.offI) this.state = 0;
      else if (t - this.lastTransition >= this.swOn - EPS_T) {
        this.state = 2;
        if (this.type === LATCHING) this.position = 1 - this.position;
        else if (this.type === LATCHING_OFF) this.position = 0;
        else this.position = 1;
      }
    } else if (this.state === 2) {
      if (this.avg < this.offI) {
        this.lastTransition = t;
        this.state = 3;
      }
    } else if (this.avg > this.onI) this.state = 2;
    else if (t - this.lastTransition >= this.swOff - EPS_T) {
      this.state = 0;
      if (this.type !== LATCHING && this.type !== LATCHING_ON && this.type !== LATCHING_OFF) this.position = 0;
    }
  }

  breakpoints(t0: number, t1: number, out: number[]): void {
    const wait = this.state === 1 ? this.swOn : this.state === 3 ? this.swOff : -1;
    if (wait < 0) return;
    const at = this.lastTransition + wait;
    if (at > t0 && at <= t1) out.push(at);
  }

  readouts(x: SolutionView, out: ReadoutSink): void {
    out.add("coilCurrent", x.x(this.branch));
    out.add("position", this.position);
  }

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    const i = x.x(this.branch);
    out[0] = i;
    out[1] = -i;
    out[2] = (x.v(this.n[2]) - this.arm()) * ARM_G;
  }

  saveState(o: Float64Array): void {
    o[0] = this.iPrev;
    o[1] = this.avg;
    o[2] = this.state;
    o[3] = this.position;
    o[4] = this.lastTransition;
  }

  loadState(f: Float64Array): void {
    this.iPrev = f[0] ?? 0;
    this.avg = f[1] ?? 0;
    this.state = Math.round(f[2] ?? 0);
    this.position = f[3] === 1 ? 1 : 0;
    this.lastTransition = f[4] ?? 0;
  }
}

export const relayCoilModel: ModelFactory = (el) => init(new RelayCoilModel(el), el);
