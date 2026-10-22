// Minimal element models for engine tests, independent of @cs/elements.

import type { ElementModel, ModelFactory, SetupContext, SolutionView, Stamper, StepInfo } from "@cs/elements";
import type { Netlist, NetlistElement, PropValue } from "@cs/model";
import { exp, log, sin } from "@cs/dmath";

const num = (p: Record<string, PropValue>, k: string, d: number): number => (typeof p[k] === "number" ? (p[k] as number) : d);

abstract class Base implements ElementModel {
  stateSize = 0;
  a = 0;
  b = 0;
  /** Called by the factory after field initializers have run. */
  init(el: NetlistElement): this {
    this.setProps(el.props);
    this.initialize?.();
    return this;
  }
  initialize?(): void;
  setup(ctx: SetupContext): void {
    this.a = ctx.nodes[0];
    this.b = ctx.nodes[1];
  }
  abstract setProps(p: Record<string, PropValue>): void;
  accept(_x: SolutionView, _s: StepInfo): void {}
  readouts(x: SolutionView, out: { add(k: string, v: number): void }): void {
    out.add("voltage", x.v(this.a) - x.v(this.b));
  }
  abstract terminalCurrents(x: SolutionView, out: Float64Array): void;
  saveState(_o: Float64Array): void {}
  loadState(_f: Float64Array): void {}
}

class Resistor extends Base {
  r = 1;
  setProps(p: Record<string, PropValue>) {
    this.r = num(p, "resistance", 1000);
  }
  stampStatic(s: Stamper) {
    s.conductance(this.a, this.b, 1 / this.r);
  }
  terminalCurrents(x: SolutionView, out: Float64Array) {
    out[0] = (x.v(this.a) - x.v(this.b)) / this.r;
    out[1] = -out[0];
  }
}

class Capacitor extends Base {
  override stateSize = 3;
  c = 1e-6;
  ic = 0;
  vPrev = 0;
  iPrev = 0;
  iPrev2 = 0;
  dtPrev = 0;
  geq = 0;
  ieq = 0;
  override initialize() {
    this.vPrev = this.ic;
    this.iPrev = this.iPrev2 = 0;
  }
  setProps(p: Record<string, PropValue>) {
    this.c = num(p, "capacitance", 1e-6);
    this.ic = num(p, "ic", 0);
  }
  stampStep(s: Stamper, st: StepInfo) {
    if (st.kind !== "transient") {
      this.geq = this.ieq = 0;
      return;
    }
    this.geq = (st.method === "trap" ? 2 : 1) * (this.c / st.dt);
    this.ieq = -this.geq * this.vPrev - (st.method === "trap" ? this.iPrev : 0);
    s.conductance(this.a, this.b, this.geq);
    s.current(this.a, this.b, this.ieq);
  }
  private i(x: SolutionView) {
    return this.geq * (x.v(this.a) - x.v(this.b)) + this.ieq;
  }
  override accept(x: SolutionView, st: StepInfo) {
    const i = st.kind === "transient" ? this.i(x) : 0;
    this.iPrev2 = this.iPrev;
    this.iPrev = i;
    this.vPrev = x.v(this.a) - x.v(this.b);
  }
  truncationError(x: SolutionView, st: StepInfo) {
    if (st.kind !== "transient") return 0;
    const i = this.i(x);
    if (st.method === "trap") return Math.abs((st.dt * (i - 2 * this.iPrev + this.iPrev2)) / (12 * this.c));
    return Math.abs((st.dt * (i - this.iPrev)) / (2 * this.c));
  }
  terminalCurrents(_x: SolutionView, out: Float64Array) {
    out[0] = this.iPrev;
    out[1] = -this.iPrev;
  }
  override saveState(o: Float64Array) {
    o[0] = this.vPrev;
    o[1] = this.iPrev;
    o[2] = this.iPrev2;
  }
  override loadState(f: Float64Array) {
    [this.vPrev, this.iPrev, this.iPrev2] = [f[0], f[1], f[2]];
  }
}

class Inductor extends Base {
  override stateSize = 3;
  l = 1e-3;
  br = 0;
  iPrev = 0;
  vPrev = 0;
  vPrev2 = 0;
  ic = 0;
  override initialize() {
    this.iPrev = this.ic;
    this.vPrev = this.vPrev2 = 0;
  }
  setProps(p: Record<string, PropValue>) {
    this.l = num(p, "inductance", 1e-3);
    this.ic = num(p, "ic", 0);
  }
  override setup(ctx: SetupContext) {
    super.setup(ctx);
    this.br = ctx.allocBranch("i");
  }
  stampStep(s: Stamper, st: StepInfo) {
    if (st.kind !== "transient") {
      s.voltageSource(this.br, this.a, this.b, 0);
      return;
    }
    const g = (st.method === "trap" ? 2 : 1) * (this.l / st.dt);
    s.voltageSource(this.br, this.a, this.b, -g * this.iPrev - (st.method === "trap" ? this.vPrev : 0));
    s.matrix(this.br, this.br, -g);
  }
  override accept(x: SolutionView, st: StepInfo) {
    this.vPrev2 = this.vPrev;
    this.vPrev = st.kind === "transient" ? x.v(this.a) - x.v(this.b) : 0;
    this.iPrev = x.x(this.br);
  }
  truncationError(x: SolutionView, st: StepInfo) {
    if (st.kind !== "transient") return 0;
    const v = x.v(this.a) - x.v(this.b);
    if (st.method === "trap") return Math.abs((st.dt * (v - 2 * this.vPrev + this.vPrev2)) / (12 * this.l));
    return Math.abs((st.dt * (v - this.vPrev)) / (2 * this.l));
  }
  terminalCurrents(x: SolutionView, out: Float64Array) {
    out[0] = x.x(this.br);
    out[1] = -out[0];
  }
  override saveState(o: Float64Array) {
    o[0] = this.iPrev;
    o[1] = this.vPrev;
    o[2] = this.vPrev2;
  }
  override loadState(f: Float64Array) {
    [this.iPrev, this.vPrev, this.vPrev2] = [f[0], f[1], f[2]];
  }
}

class VSource extends Base {
  br = 0;
  v = 0;
  amp = 0;
  freq = 0;
  setProps(p: Record<string, PropValue>) {
    this.v = num(p, "voltage", 0);
    this.amp = num(p, "amplitude", 0);
    this.freq = num(p, "frequency", 0);
  }
  override setup(ctx: SetupContext) {
    super.setup(ctx);
    this.br = ctx.allocBranch("i");
  }
  value(t: number) {
    return this.v + (this.freq > 0 ? this.amp * sin(2 * Math.PI * this.freq * t) : 0);
  }
  stampStep(s: Stamper, st: StepInfo) {
    s.voltageSource(this.br, this.a, this.b, this.value(st.t) * st.sourceScale);
  }
  terminalCurrents(x: SolutionView, out: Float64Array) {
    out[0] = x.x(this.br);
    out[1] = -out[0];
  }
}

/** Square wave source with breakpoints at each edge. */
class PulseSource extends VSource {
  period = 1e-3;
  override setProps(p: Record<string, PropValue>) {
    super.setProps(p);
    this.period = num(p, "period", 1e-3);
  }
  override value(t: number) {
    const ph = t / this.period - Math.floor(t / this.period + 1e-12);
    return ph < 0.5 ? this.v : 0;
  }
  breakpoints(t0: number, t1: number, out: number[]) {
    const half = this.period / 2;
    for (let k = Math.floor(t0 / half) + 1; k * half <= t1; k++) out.push(k * half);
  }
}

class ISource extends Base {
  i = 0;
  setProps(p: Record<string, PropValue>) {
    this.i = num(p, "current", 0);
  }
  stampStep(s: Stamper, st: StepInfo) {
    s.current(this.a, this.b, this.i * st.sourceScale);
  }
  terminalCurrents(_x: SolutionView, out: Float64Array) {
    out[0] = this.i;
    out[1] = -this.i;
  }
}

class Diode extends Base {
  readonly nonlinear = true;
  is = 1e-14;
  nvt = 0.025852;
  vdLim = 0;
  vdOld = 0;
  setProps(p: Record<string, PropValue>) {
    this.is = num(p, "is", 1e-14);
  }
  private limit(vnew: number, vold: number) {
    const vcrit = this.nvt * log(this.nvt / (Math.SQRT2 * this.is));
    if (vnew > vcrit && Math.abs(vnew - vold) > 2 * this.nvt) {
      if (vold > 0) {
        const arg = 1 + (vnew - vold) / this.nvt;
        return arg > 0 ? vold + this.nvt * log(arg) : vcrit;
      }
      return this.nvt * log(vnew / this.nvt);
    }
    return vnew;
  }
  stampNewton(s: Stamper, x: SolutionView, st: StepInfo) {
    const vd = this.limit(x.v(this.a) - x.v(this.b), this.vdLim);
    this.vdLim = vd;
    const e = exp(vd / this.nvt);
    const id = this.is * (e - 1);
    const gd = (this.is / this.nvt) * e + st.gmin;
    s.conductance(this.a, this.b, gd);
    s.current(this.a, this.b, id - gd * vd);
  }
  hasConverged(x: SolutionView) {
    const vd = x.v(this.a) - x.v(this.b);
    return Math.abs(vd - this.vdLim) <= 1e-3 * Math.abs(vd) + 1e-6;
  }
  override accept(x: SolutionView) {
    this.vdOld = x.v(this.a) - x.v(this.b);
  }
  terminalCurrents(x: SolutionView, out: Float64Array) {
    out[0] = this.is * (exp((x.v(this.a) - x.v(this.b)) / this.nvt) - 1);
    out[1] = -out[0];
  }
}

const factories: Record<string, ModelFactory> = {
  resistor: (el) => new Resistor().init(el),
  capacitor: (el) => new Capacitor().init(el),
  inductor: (el) => new Inductor().init(el),
  vsource: (el) => new VSource().init(el),
  pulse: (el) => new PulseSource().init(el),
  isource: (el) => new ISource().init(el),
  diode: (el) => new Diode().init(el),
};

export const lookup = (type: string): ModelFactory | undefined => factories[type];

export function netlist(nodeCount: number, elements: [string, string, number[], Record<string, PropValue>][], settings: Partial<Netlist["settings"]> = {}): Netlist {
  return {
    nodeCount,
    nodeNames: ["GND", ...Array.from({ length: nodeCount }, (_, i) => `N${i + 1}`)],
    elements: elements.map(([id, type, nodes, props]) => ({ id, type, nodes, props })),
    settings: { realisticParts: false, realisticRatings: false, start: "zero", seed: 1, ...settings },
  };
}
