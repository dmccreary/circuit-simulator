import type { ComplexStamper, ModelFactory, ReadoutSink, SolutionView, Stamper } from "../api";
import { init, TwoTerminalModel } from "../shared/modelKit";
import { num, type Props } from "../shared/props";

class VoltmeterModel extends TwoTerminalModel {
  private g = 0;

  protected applyProps(p: Props): void {
    const r = num(p, "inputResistance", 0);
    this.g = r > 0 ? 1 / r : 0;
  }

  stampStatic(s: Stamper): void {
    if (this.g > 0) s.conductance(this.a, this.b, this.g);
  }

  stampAC(s: ComplexStamper): void {
    if (this.g > 0) s.admittance(this.a, this.b, this.g, 0);
  }

  protected current(x: SolutionView): number {
    return this.voltage(x) * this.g;
  }

  override readouts(x: SolutionView, out: ReadoutSink): void {
    out.add("voltage", this.voltage(x));
    out.add("current", this.current(x));
  }
}

export const voltmeterModel: ModelFactory = (el) => init(new VoltmeterModel(el), el);
