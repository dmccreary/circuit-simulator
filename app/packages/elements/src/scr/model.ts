import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ElementModel, ModelFactory, ReadoutSink, SetupContext, SolutionView, StepInfo, Stamper } from "../api";
import { DiodePath, INTERNAL_SHUNT } from "../shared/diodePath";
import { init } from "../shared/modelKit";
import { num, type Props } from "../shared/props";

const R_ON = 0.0105;
const R_OFF = 1e6;

/**
 * SCRElm (CircuitJS1): anode (0) -[Ra]- internal node -|>|- cathode (1), and
 * gate (2) -[Rg]- cathode. Ra is 0.0105 Ω when on and 1 MΩ when off. CircuitJS1
 * re-decides Ra inside every Newton iteration; here the latch condition
 * ig/triggerI + ia/holdingI > 1 is evaluated on each accepted step and holds for
 * the next one, which keeps Newton smooth. The internal node is an extra unknown.
 */
class ScrModel implements ElementModel {
  readonly nonlinear = true;
  readonly stateSize = 2;
  private nodes: NodeIndex[];
  private n: NodeIndex = 0;
  private diode = new DiodePath();
  private trig = 0.01;
  private hold = 0.0082;
  private rg = 50;
  private on = false;

  constructor(el: NetlistElement) {
    this.nodes = [...el.nodes];
  }

  setup(ctx: SetupContext): void {
    this.nodes = [...ctx.nodes];
    this.n = ctx.allocBranch("n");
  }

  setProps(p: Props): void {
    this.trig = Math.max(1e-12, num(p, "triggerCurrent", 0.01));
    this.hold = Math.max(1e-12, num(p, "holdingCurrent", 0.0082));
    this.rg = Math.max(1e-6, num(p, "gateResistance", 50));
  }

  initialize(): void {
    this.on = false;
    this.diode.vIter = 0;
  }

  private get ra(): number {
    return this.on ? R_ON : R_OFF;
  }

  stampStep(s: Stamper, _step: StepInfo): void {
    const [a, k, g] = this.nodes;
    s.conductance(a, this.n, 1 / this.ra);
    s.conductance(g, k, 1 / this.rg);
    s.matrix(this.n, this.n, INTERNAL_SHUNT);
  }

  stampNewton(s: Stamper, x: SolutionView, step: StepInfo): void {
    this.diode.stamp(s, x, this.n, this.nodes[1], step.gmin);
  }

  hasConverged(x: SolutionView): boolean {
    return this.diode.converged(x, this.n, this.nodes[1]);
  }

  private anodeCurrent(x: SolutionView): number {
    return (x.v(this.nodes[0]) - x.x(this.n)) / this.ra;
  }

  private gateCurrent(x: SolutionView): number {
    return (x.v(this.nodes[2]) - x.v(this.nodes[1])) / this.rg;
  }

  accept(x: SolutionView, step: StepInfo): void {
    this.diode.accept(x, this.n, this.nodes[1]);
    if (step.kind === "ac") return;
    this.on = this.gateCurrent(x) / this.trig + this.anodeCurrent(x) / this.hold > 1;
  }

  readouts(x: SolutionView, out: ReadoutSink): void {
    const v = x.v(this.nodes[0]) - x.v(this.nodes[1]);
    const ia = this.anodeCurrent(x);
    out.add("voltage", v);
    out.add("current", ia);
    out.add("power", v * ia + (x.v(this.nodes[2]) - x.v(this.nodes[1])) * this.gateCurrent(x));
    out.add("gateCurrent", this.gateCurrent(x));
    out.add("on", this.on ? 1 : 0);
  }

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    const ia = this.anodeCurrent(x);
    const ig = this.gateCurrent(x);
    out[0] = ia;
    out[1] = -ia - ig;
    out[2] = ig;
  }

  saveState(out: Float64Array): void {
    out[0] = this.on ? 1 : 0;
    out[1] = this.diode.vIter;
  }

  loadState(from: Float64Array): void {
    this.on = (from[0] ?? 0) !== 0;
    this.diode.vIter = from[1] ?? 0;
  }
}

export const scrModel: ModelFactory = (el) => init(new ScrModel(el), el);
