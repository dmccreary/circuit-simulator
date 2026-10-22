// After CircuitJS1's ThreePhaseMotorElm (stamp, startIteration):
// https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/client/ThreePhaseMotorElm.java
// Five coupled windings: stator U, V, W (each in series with Rs) and two
// rotor windings (each in series with 1.5·Rr and a speed-voltage source),
// integrated by backward Euler as CircuitJS1 does, in branch-current form:
//   stator k: V(k1) - V(k2) - Rs·i_k - Σ_j (L_kj/dt)·(i_j - i_j') = 0
//   rotor  r: Σ_j (L_rj/dt)·(i_j - i_j') + 1.5·Rr·i_r = e_r
// The rotor emfs e_r, the torque and the speed come from the last accepted
// step (CircuitJS1 updates them in startIteration):
//   torque = Zp·√3/2·Lm·((i_V - i_W)·i_r1 - √3·i_U·i_r2)
//   speed += dt·(torque - b·speed)/J
//   e_r1 = -Zp·speed·(Lm·√3/2·(i_V - i_W) + 1.5·Lr·i_r2)
//   e_r2 =  Zp·speed·(1.5·Lm·i_U + 1.5·Lr·i_r1)

import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ElementModel, ModelFactory, ReadoutSink, SetupContext, SolutionView, Stamper, StepInfo, UnknownIndex } from "../api";
import { init } from "../shared/modelKit";
import { num, type Props } from "../shared/props";

const ZP = 2; // pole pairs
const SQRT3 = Math.sqrt(3);
const COILS = 5;

class ThreePhaseMotorModel implements ElementModel {
  readonly stateSize = 2 * COILS + 2;
  private n: NodeIndex[];
  private br: UnknownIndex[] = [];
  private rs = 0.435;
  private rr = 0.816;
  private lr = 0.0297;
  private lm = 0.0287;
  private b = 0.05;
  private j = 1;
  private L: number[][] = [];
  // state: currents of the last two accepted steps, speed, angle
  private i = new Array<number>(COILS).fill(0);
  private iPrev = new Array<number>(COILS).fill(0);
  private speed = 0;
  private angle = Math.PI / 2;
  private torque = 0;

  constructor(el: NetlistElement) {
    this.n = [0, 1, 2, 3, 4, 5].map((k) => el.nodes[k] ?? 0);
  }

  setup(ctx: SetupContext): void {
    this.n = [0, 1, 2, 3, 4, 5].map((k) => ctx.nodes[k] ?? 0);
    this.br = ["U", "V", "W", "rotor1", "rotor2"].map((s) => ctx.allocBranch(s));
  }

  setProps(p: Props): void {
    this.rs = Math.max(1e-9, num(p, "statorResistance", 0.435));
    this.rr = Math.max(1e-9, num(p, "rotorResistance", 0.816));
    const ls = Math.max(1e-9, num(p, "statorInductance", 0.0294));
    this.lr = Math.max(1e-9, num(p, "rotorInductance", 0.0297));
    this.lm = Math.max(0, num(p, "mutualInductance", 0.0287));
    this.b = Math.max(0, num(p, "friction", 0.05));
    this.j = Math.max(1e-9, num(p, "inertia", 1));
    const lr2 = 1.5 * this.lr;
    const self = [ls, ls, ls, lr2, lr2];
    const k0 = this.lm / Math.sqrt(ls * lr2);
    const c: number[][] = Array.from({ length: COILS }, () => new Array<number>(COILS).fill(0));
    const set = (a: number, b: number, v: number) => {
      c[a][b] = v;
      c[b][a] = v;
    };
    set(0, 3, k0);
    set(1, 3, -k0 / 2);
    set(1, 4, (k0 * SQRT3) / 2);
    set(2, 3, -k0 / 2);
    set(2, 4, (-k0 * SQRT3) / 2);
    this.L = self.map((li, a) => self.map((lj, b) => (a === b ? li : c[a][b] * Math.sqrt(li * lj))));
  }

  initialize(): void {
    this.i.fill(0);
    this.iPrev.fill(0);
    this.speed = 0;
    this.angle = Math.PI / 2;
    this.torque = 0;
  }

  private emf(): [number, number] {
    const [iu, iv, iw, r1, r2] = this.i;
    return [-ZP * this.speed * (((this.lm * SQRT3) / 2) * (iv - iw) + 1.5 * this.lr * r2), ZP * this.speed * (1.5 * this.lm * iu + 1.5 * this.lr * r1)];
  }

  stampStep(s: Stamper, step: StepInfo): void {
    const f = step.kind === "transient" && step.dt > 0 ? 1 / step.dt : 0;
    const e = this.emf();
    for (let k = 0; k < COILS; k++) {
      let hist = 0;
      for (let q = 0; q < COILS; q++) hist += f * this.L[k][q] * this.i[q];
      if (k < 3) {
        // V(k1) - V(k2) - Rs·i_k - Σ (L/dt)·i_q = -Σ (L/dt)·i_q'
        s.voltageSource(this.br[k], this.n[2 * k], this.n[2 * k + 1], -hist);
        s.matrix(this.br[k], this.br[k], -this.rs);
        for (let q = 0; q < COILS; q++) if (f) s.matrix(this.br[k], this.br[q], -f * this.L[k][q]);
      } else {
        // Σ (L/dt)·i_q + 1.5·Rr·i_r = e_r + Σ (L/dt)·i_q'
        s.matrix(this.br[k], this.br[k], 1.5 * this.rr);
        for (let q = 0; q < COILS; q++) if (f) s.matrix(this.br[k], this.br[q], f * this.L[k][q]);
        s.rhs(this.br[k], e[k - 3] * step.sourceScale + hist);
      }
    }
  }

  accept(x: SolutionView, step: StepInfo): void {
    for (let k = 0; k < COILS; k++) {
      this.iPrev[k] = this.i[k];
      this.i[k] = x.x(this.br[k]);
    }
    const [iu, iv, iw, r1, r2] = this.i;
    this.torque = ZP * (SQRT3 / 2) * this.lm * ((iv - iw) * r1 - SQRT3 * iu * r2);
    if (step.kind === "transient" && step.dt > 0) {
      this.speed += (step.dt * (this.torque - this.b * this.speed)) / this.j;
      this.angle += this.speed * step.dt;
    }
  }

  /** Backward-Euler error estimate of the winding currents, amps: half the second difference. */
  truncationError(x: SolutionView, step: StepInfo): number {
    if (step.kind !== "transient" || !(step.dt > 0)) return 0;
    let e = 0;
    for (let k = 0; k < COILS; k++) e = Math.max(e, Math.abs(x.x(this.br[k]) - 2 * this.i[k] + this.iPrev[k]) / 2);
    return e;
  }

  readouts(_x: SolutionView, out: ReadoutSink): void {
    out.add("speed", (60 * this.speed) / (2 * Math.PI));
    out.add("torque", this.torque);
    out.add("angle", this.angle);
  }

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    for (let k = 0; k < 3; k++) {
      const i = x.x(this.br[k]);
      out[2 * k] = i;
      out[2 * k + 1] = -i;
    }
  }

  saveState(o: Float64Array): void {
    for (let k = 0; k < COILS; k++) {
      o[k] = this.i[k];
      o[COILS + k] = this.iPrev[k];
    }
    o[2 * COILS] = this.speed;
    o[2 * COILS + 1] = this.angle;
  }

  loadState(f: Float64Array): void {
    for (let k = 0; k < COILS; k++) {
      this.i[k] = f[k] ?? 0;
      this.iPrev[k] = f[COILS + k] ?? 0;
    }
    this.speed = f[2 * COILS] ?? 0;
    this.angle = f[2 * COILS + 1] ?? Math.PI / 2;
  }
}

export const threePhaseMotorModel: ModelFactory = (el) => init(new ThreePhaseMotorModel(el), el);
