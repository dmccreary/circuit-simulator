// After CircuitJS1's MemristorElm.startIteration(): the doped width moves by
// dt·mobility·Ron·i/D each accepted step and sets the next step's resistance.
// https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/client/MemristorElm.java

import type { ModelFactory, ReadoutSink, SolutionView, Stamper, StepInfo } from "../api";
import { init, TwoTerminalModel } from "../shared/modelKit";
import { num, type Props } from "../shared/props";

class MemristorModel extends TwoTerminalModel {
  override stateSize = 1;
  private ron = 100;
  private roff = 16000;
  private width = 1e-8;
  private mobility = 1e-10;
  private w0 = 0;
  private w = 0;

  protected applyProps(p: Props): void {
    this.ron = Math.max(1e-6, num(p, "onResistance", 100));
    this.roff = Math.max(1e-6, num(p, "offResistance", 16000));
    this.width = Math.max(1e-15, num(p, "totalWidth", 1e-8));
    this.mobility = num(p, "mobility", 1e-10);
    this.w0 = Math.min(this.width, Math.max(0, num(p, "initialWidth", 0)));
  }

  initialize(): void {
    this.w = this.w0;
  }

  private resistance(): number {
    const f = this.w / this.width;
    return this.ron * f + this.roff * (1 - f);
  }

  stampStep(s: Stamper, _step: StepInfo): void {
    s.conductance(this.a, this.b, 1 / this.resistance());
  }

  protected current(x: SolutionView): number {
    return this.voltage(x) / this.resistance();
  }

  override accept(x: SolutionView, step: StepInfo): void {
    if (step.kind !== "transient" || !(step.dt > 0)) return;
    const i = this.current(x);
    this.w = Math.min(this.width, Math.max(0, this.w + (step.dt * this.mobility * this.ron * i) / this.width));
  }

  override readouts(x: SolutionView, out: ReadoutSink): void {
    super.readouts(x, out);
    out.add("resistance", this.resistance());
  }

  override saveState(o: Float64Array): void {
    o[0] = this.w;
  }

  override loadState(f: Float64Array): void {
    this.w = f[0];
  }
}

export const memristorModel: ModelFactory = (el) => init(new MemristorModel(el), el);
