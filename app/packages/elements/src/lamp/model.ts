import type { ModelFactory, ReadoutSink, SolutionView } from "../api";
import { ResistorModel } from "../resistor/model";
import { init } from "../shared/modelKit";
import { num, R_MIN, type Props } from "../shared/props";

/** Ohmic filament: R = Vrated² / Prated. Brightness is power as a fraction of rated, capped at 1. */
class LampModel extends ResistorModel {
  private ratedPower = 3;

  protected override applyProps(p: Props): void {
    const v = num(p, "ratedVoltage", 6);
    this.ratedPower = Math.max(1e-12, num(p, "ratedPower", 3));
    this.r = Math.max(R_MIN, (v * v) / this.ratedPower);
  }

  override readouts(x: SolutionView, out: ReadoutSink): void {
    super.readouts(x, out);
    const v = this.voltage(x);
    out.add("brightness", Math.min(1, (v * v) / this.r / this.ratedPower));
  }
}

export const lampModel: ModelFactory = (el) => init(new LampModel(el), el);
