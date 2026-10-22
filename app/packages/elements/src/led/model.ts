import type { ModelFactory, ReadoutSink, SolutionView } from "../api";
import { DiodeModel } from "../diode/model";
import { VT } from "../shared/junction";
import { exp } from "../shared/math";
import { init } from "../shared/modelKit";
import { num, str, type Props } from "../shared/props";
import { LED_FORWARD_VOLTAGE } from "./descriptor";

/** Emission coefficient typical of LEDs. */
const LED_N = 2;

/** A diode whose saturation current is chosen so it drops the color's forward voltage at full-brightness current. */
class LedModel extends DiodeModel {
  private iFull = 0.02;

  protected override applyProps(p: Props): void {
    const color = str(p, "color", "red");
    const vf = LED_FORWARD_VOLTAGE[color] ?? num(p, "forwardVoltage", 1.8);
    this.iFull = Math.max(1e-9, num(p, "fullBrightnessCurrent", 0.02));
    const is = this.iFull / (exp(vf / (LED_N * VT)) - 1);
    this.junction.setParams(is, LED_N);
  }

  override readouts(x: SolutionView, out: ReadoutSink): void {
    super.readouts(x, out);
    out.add("brightness", Math.min(1, Math.max(0, this.current(x) / this.iFull)));
  }
}

export const ledModel: ModelFactory = (el) => init(new LedModel(el), el);
