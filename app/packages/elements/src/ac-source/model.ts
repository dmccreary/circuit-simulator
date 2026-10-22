import type { ModelFactory, ReadoutSink, SolutionView, StepInfo } from "../api";
import { sin } from "../shared/math";
import { init } from "../shared/modelKit";
import { num, type Props } from "../shared/props";
import { VoltageSourceModel } from "../shared/voltageSourceModel";

/** v(t) = offset + amplitude·sin(2π·f·t + phase°). In "ac" analysis it is the unit-phase stimulus of size amplitude. */
class AcSourceModel extends VoltageSourceModel {
  private amplitude = 5;
  private frequency = 60;
  private offset = 0;
  private phaseRad = 0;

  protected override applyProps(p: Props): void {
    super.applyProps(p);
    this.amplitude = num(p, "amplitude", 5);
    this.frequency = num(p, "frequency", 60);
    this.offset = num(p, "offset", 0);
    this.phaseRad = (num(p, "phase", 0) * Math.PI) / 180;
  }

  protected emf(t: number, step: StepInfo): number {
    if (step.kind === "ac") return this.amplitude;
    return this.offset + this.amplitude * sin(2 * Math.PI * this.frequency * t + this.phaseRad);
  }

  override readouts(x: SolutionView, out: ReadoutSink): void {
    super.readouts(x, out);
    out.add("frequency", this.frequency);
    out.add("peak", Math.abs(this.amplitude));
    out.add("rms", Math.abs(this.amplitude) / Math.SQRT2);
  }
}

export const acSourceModel: ModelFactory = (el) => init(new AcSourceModel(el), el);
