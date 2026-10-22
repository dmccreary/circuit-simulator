import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ElementModel, ModelFactory, ReadoutSink, SetupContext, SolutionView, StepInfo, Stamper } from "../api";
import { exp } from "../shared/math";
import { init } from "../shared/modelKit";
import { num, R_MIN, str, type Props } from "../shared/props";

/** Shape constant of the log (audio) taper: about 10% of the resistance at half travel. */
const LOG_K = 4.4;

/** Two resistors meeting at the wiper: A–W is fraction(position)·R, W–B the rest. */
class PotentiometerModel implements ElementModel {
  readonly stateSize = 0;
  private n: NodeIndex[];
  private r = 10000;
  private position = 0.5;
  private logTaper = false;
  private gA = 0;
  private gB = 0;

  constructor(el: NetlistElement) {
    this.n = [el.nodes[0] ?? 0, el.nodes[1] ?? 0, el.nodes[2] ?? 0];
  }

  setup(ctx: SetupContext): void {
    this.n = [ctx.nodes[0] ?? 0, ctx.nodes[1] ?? 0, ctx.nodes[2] ?? 0];
  }

  setProps(p: Props): void {
    this.r = Math.max(R_MIN, num(p, "resistance", 10000));
    this.position = Math.min(1, Math.max(0, num(p, "position", 0.5)));
    this.logTaper = str(p, "taper", "linear") === "log";
    const f = this.logTaper ? (exp(LOG_K * this.position) - 1) / (exp(LOG_K) - 1) : this.position;
    this.gA = 1 / Math.max(R_MIN, this.r * f);
    this.gB = 1 / Math.max(R_MIN, this.r * (1 - f));
  }

  stampStatic(s: Stamper): void {
    s.conductance(this.n[0], this.n[2], this.gA);
    s.conductance(this.n[2], this.n[1], this.gB);
  }

  accept(_x: SolutionView, _step: StepInfo): void {}

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    const vw = x.v(this.n[2]);
    const iA = (x.v(this.n[0]) - vw) * this.gA;
    const iB = (x.v(this.n[1]) - vw) * this.gB;
    out[0] = iA;
    out[1] = iB;
    out[2] = -(iA + iB);
  }

  readouts(x: SolutionView, out: ReadoutSink): void {
    const cur = new Float64Array(3);
    this.terminalCurrents(x, cur);
    out.add("resistanceA", 1 / this.gA);
    out.add("resistanceB", 1 / this.gB);
    out.add("wiperVoltage", x.v(this.n[2]));
    out.add("currentA", cur[0]);
    out.add("currentB", cur[1]);
    out.add("currentWiper", cur[2]);
  }

  saveState(_out: Float64Array): void {}
  loadState(_from: Float64Array): void {}
}

export const potentiometerModel: ModelFactory = (el) => init(new PotentiometerModel(el), el);
