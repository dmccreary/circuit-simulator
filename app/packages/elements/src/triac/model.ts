import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ElementModel, ModelFactory, ReadoutSink, SetupContext, SolutionView, StepInfo, Stamper } from "../api";
import { DiodePath, INTERNAL_SHUNT } from "../shared/diodePath";
import { init } from "../shared/modelKit";
import { bool, num, type Props } from "../shared/props";

const R_ON = 0.01;
const R_OFF = 1e6;

/**
 * TriacElm (CircuitJS1): MT2 (0) -|>|-and-|<|- internal node -[Ra]- MT1 (1),
 * gate (2) -[Rc]- MT1. Ra is 0.01 Ω when on, 1 MΩ when off. As in
 * startIteration(), the state is decided from the last accepted step: off when
 * |i2| < holdingI, then on when |ig| > triggerI.
 */
class TriacModel implements ElementModel {
  readonly nonlinear = true;
  readonly stateSize = 3;
  private nodes: NodeIndex[];
  private n: NodeIndex = 0;
  private fwd = new DiodePath();
  private rev = new DiodePath();
  private trig = 0.01;
  private hold = 0.0082;
  private rc = 100;
  private on0 = false;
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
    this.rc = Math.max(1e-6, num(p, "gateResistance", 100));
    this.on0 = bool(p, "on", false);
  }

  initialize(): void {
    this.on = this.on0;
    this.fwd.vIter = this.rev.vIter = 0;
  }

  private get ra(): number {
    return this.on ? R_ON : R_OFF;
  }

  stampStep(s: Stamper, _step: StepInfo): void {
    const [, mt1, g] = this.nodes;
    s.conductance(this.n, mt1, 1 / this.ra);
    s.conductance(g, mt1, 1 / this.rc);
    s.matrix(this.n, this.n, INTERNAL_SHUNT);
  }

  stampNewton(s: Stamper, x: SolutionView, step: StepInfo): void {
    const mt2 = this.nodes[0];
    this.fwd.stamp(s, x, mt2, this.n, step.gmin);
    this.rev.stamp(s, x, this.n, mt2, step.gmin);
  }

  hasConverged(x: SolutionView): boolean {
    const mt2 = this.nodes[0];
    return this.fwd.converged(x, mt2, this.n) && this.rev.converged(x, this.n, mt2);
  }

  /** Main current, MT2 to MT1 through the triac. */
  private mainCurrent(x: SolutionView): number {
    return (x.x(this.n) - x.v(this.nodes[1])) / this.ra;
  }

  private gateCurrent(x: SolutionView): number {
    return (x.v(this.nodes[2]) - x.v(this.nodes[1])) / this.rc;
  }

  accept(x: SolutionView, step: StepInfo): void {
    const mt2 = this.nodes[0];
    this.fwd.accept(x, mt2, this.n);
    this.rev.accept(x, this.n, mt2);
    if (step.kind === "ac") return;
    if (Math.abs(this.mainCurrent(x)) < this.hold) this.on = false;
    if (Math.abs(this.gateCurrent(x)) > this.trig) this.on = true;
  }

  readouts(x: SolutionView, out: ReadoutSink): void {
    const v = x.v(this.nodes[0]) - x.v(this.nodes[1]);
    const i2 = this.mainCurrent(x);
    const ig = this.gateCurrent(x);
    out.add("voltage", v);
    out.add("current", i2);
    out.add("power", v * i2 + (x.v(this.nodes[2]) - x.v(this.nodes[1])) * ig);
    out.add("gateCurrent", ig);
    out.add("on", this.on ? 1 : 0);
  }

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    const i2 = this.mainCurrent(x);
    const ig = this.gateCurrent(x);
    out[0] = i2;
    out[1] = -i2 - ig;
    out[2] = ig;
  }

  saveState(out: Float64Array): void {
    out[0] = this.on ? 1 : 0;
    out[1] = this.fwd.vIter;
    out[2] = this.rev.vIter;
  }

  loadState(from: Float64Array): void {
    this.on = (from[0] ?? 0) !== 0;
    this.fwd.vIter = from[1] ?? 0;
    this.rev.vIter = from[2] ?? 0;
  }
}

export const triacModel: ModelFactory = (el) => init(new TriacModel(el), el);
