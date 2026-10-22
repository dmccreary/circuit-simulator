import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ComplexStamper, ElementModel, ModelFactory, ReadoutSink, SetupContext, SolutionView, StepInfo, Stamper } from "../api";
import { closeEnough, limitStep, stampLinearized, type ControlPair } from "../shared/linearize";
import { init } from "../shared/modelKit";
import { num, type Props } from "../shared/props";

/** TriodeElm's grid current resistance, and the leakages it uses to avoid a singular matrix. */
const GRID_R = 6000;
const G_LEAK = 1e-8;
/** Newton limits per iteration (TriodeElm.doStep limits grid and cathode to 0.5 V). */
const MAX_DVGK = 0.5;
const MAX_DVPK = 20;

interface Op {
  ip: number;
  gm: number; // dIp/dVgk
  gds: number; // dIp/dVpk
  ig: number;
  gg: number; // dIg/dVgk
}

/** Plate and grid currents (TriodeElm.doStep), made continuous at the switch points. */
export function triodeCurrents(vgk: number, vpk: number, mu: number, kg1: number): Op {
  const ival = vgk + vpk / mu;
  let ip = G_LEAK * vpk;
  let gm = 0;
  let gds = G_LEAK;
  if (ival > 0) {
    const r = Math.sqrt(ival);
    ip += (ival * r) / kg1;
    const q = (1.5 * r) / kg1;
    gm = q;
    gds += q / mu;
  }
  const ig = G_LEAK * vgk + (vgk > 0 ? vgk / GRID_R : 0);
  const gg = G_LEAK + (vgk > 0 ? 1 / GRID_R : 0);
  return { ip, gm, gds, ig, gg };
}

/**
 * Terminals G (0), P (1), K (2). Controls Vgk and Vpk; the plate current
 * flows P -> K and the grid current G -> K.
 */
class TriodeModel implements ElementModel {
  readonly nonlinear = true;
  readonly stateSize = 2;
  private nodes: NodeIndex[];
  private mu = 93;
  private kg1 = 680;
  private vgk = 0;
  private vpk = 0;
  private acc: [number, number] = [0, 0];

  constructor(el: NetlistElement) {
    this.nodes = [...el.nodes];
  }

  setup(ctx: SetupContext): void {
    this.nodes = [...ctx.nodes];
  }

  setProps(p: Props): void {
    this.mu = Math.max(1e-3, num(p, "mu", 93));
    this.kg1 = Math.max(1e-6, num(p, "kg1", 680));
  }

  initialize(): void {
    this.vgk = this.vpk = 0;
    this.acc = [0, 0];
  }

  private controls(): ControlPair[] {
    const [g, p, k] = this.nodes;
    return [
      { plus: g, minus: k },
      { plus: p, minus: k },
    ];
  }

  private raw(x: SolutionView): [number, number] {
    const [g, p, k] = this.nodes;
    return [x.v(g) - x.v(k), x.v(p) - x.v(k)];
  }

  private stampAt(s: Stamper, vgk: number, vpk: number, matrixOnly: boolean): void {
    const o = triodeCurrents(vgk, vpk, this.mu, this.kg1);
    stampLinearized(
      s,
      this.nodes,
      this.controls(),
      [vgk, vpk],
      [o.ig, o.ip, -o.ig - o.ip],
      [
        [o.gg, 0],
        [o.gm, o.gds],
        [-o.gg - o.gm, -o.gds],
      ],
      matrixOnly,
    );
  }

  stampNewton(s: Stamper, x: SolutionView, step: StepInfo): void {
    if (step.kind === "ac") {
      this.stampAt(s, this.acc[0], this.acc[1], true);
      return;
    }
    const [vgk, vpk] = this.raw(x);
    this.vgk = limitStep(vgk, this.vgk, MAX_DVGK);
    this.vpk = limitStep(vpk, this.vpk, MAX_DVPK);
    this.stampAt(s, this.vgk, this.vpk, false);
  }

  stampAC(s: ComplexStamper, op: SolutionView): void {
    const [vgk, vpk] = this.raw(op);
    const o = triodeCurrents(vgk, vpk, this.mu, this.kg1);
    const [g, p, k] = this.nodes;
    // Ig = gg·vgk; Ip = gm·vgk + gds·vpk, as admittances and transconductances.
    s.admittance(g, k, o.gg, 0);
    s.admittance(p, k, o.gds, 0);
    s.matrix(p, g, o.gm, 0);
    s.matrix(p, k, -o.gm, 0);
    s.matrix(k, g, -o.gm, 0);
    s.matrix(k, k, o.gm, 0);
  }

  hasConverged(x: SolutionView): boolean {
    const [vgk, vpk] = this.raw(x);
    return closeEnough(vgk, this.vgk) && closeEnough(vpk, this.vpk);
  }

  accept(x: SolutionView): void {
    this.acc = this.raw(x);
    [this.vgk, this.vpk] = this.acc;
  }

  readouts(x: SolutionView, out: ReadoutSink): void {
    const [vgk, vpk] = this.raw(x);
    const o = triodeCurrents(vgk, vpk, this.mu, this.kg1);
    out.add("ip", o.ip);
    out.add("ig", o.ig);
    out.add("vpk", vpk);
    out.add("vgk", vgk);
    out.add("power", o.ip * vpk + o.ig * vgk);
  }

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    const [vgk, vpk] = this.raw(x);
    const o = triodeCurrents(vgk, vpk, this.mu, this.kg1);
    out[0] = o.ig;
    out[1] = o.ip;
    out[2] = -o.ig - o.ip;
  }

  saveState(out: Float64Array): void {
    out[0] = this.acc[0];
    out[1] = this.acc[1];
  }

  loadState(from: Float64Array): void {
    this.acc = [from[0] ?? 0, from[1] ?? 0];
    [this.vgk, this.vpk] = this.acc;
  }
}

export const triodeModel: ModelFactory = (el) => init(new TriodeModel(el), el);
