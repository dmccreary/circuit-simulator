import type { ComplexStamper, ModelFactory, ReadoutSink, SolutionView, StepInfo, Stamper } from "../api";
import { acStimulus, type AcStimulus } from "../shared/acStamp";
import { init, TwoTerminalModel } from "../shared/modelKit";
import { num, type Props } from "../shared/props";

/** Pushes `current` into terminal 0 and out of terminal 1. Readouts give delivered power. */
class CurrentSourceModel extends TwoTerminalModel {
  private i = 0.01;
  private scale = 1;
  private ac: AcStimulus = { re: 0, im: 0 };

  protected applyProps(p: Props): void {
    this.i = num(p, "current", 0.01);
    this.ac = acStimulus(p);
  }

  stampAC(s: ComplexStamper): void {
    s.current(this.a, this.b, this.ac.re, this.ac.im);
  }

  stampStep(s: Stamper, step: StepInfo): void {
    this.scale = step.kind === "ac" ? 0 : step.sourceScale;
    s.current(this.a, this.b, this.i * this.scale);
  }

  protected current(_x: SolutionView): number {
    return this.i * this.scale;
  }

  override readouts(x: SolutionView, out: ReadoutSink): void {
    const v = this.voltage(x);
    const i = this.current(x);
    out.add("voltage", v);
    out.add("current", i);
    out.add("power", -v * i);
  }
}

export const currentSourceModel: ModelFactory = (el) => init(new CurrentSourceModel(el), el);
