import type { ModelFactory, ReadoutSink, SolutionView, Stamper } from "../api";
import { init, TwoTerminalModel } from "../shared/modelKit";
import { num, R_MIN, type Props } from "../shared/props";

export class ResistorModel extends TwoTerminalModel {
  protected r = 1000;

  protected applyProps(p: Props): void {
    this.r = Math.max(R_MIN, num(p, "resistance", 1000));
  }

  stampStatic(s: Stamper): void {
    s.conductance(this.a, this.b, 1 / this.r);
  }

  protected current(x: SolutionView): number {
    return this.voltage(x) / this.r;
  }

  override readouts(x: SolutionView, out: ReadoutSink): void {
    super.readouts(x, out);
    out.add("resistance", this.r);
  }
}

export const resistorModel: ModelFactory = (el) => init(new ResistorModel(el), el);
