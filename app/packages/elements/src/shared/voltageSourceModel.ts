import type { ComplexStamper, ReadoutSink, SetupContext, SolutionView, StepInfo, Stamper, UnknownIndex } from "../api";
import { acStimulus, type AcStimulus } from "./acStamp";
import { TwoTerminalModel } from "./modelKit";
import { num, type Props } from "./props";

/**
 * Ideal voltage source with optional series resistance, using a branch unknown:
 *   V(+) - V(-) - R·x[branch] = E(t)
 * x[branch] is the current into "+" through the source (SPICE sign), so a
 * source delivering power has a negative branch current. Readouts report
 * the delivered current and power, which is what students expect.
 */
export abstract class VoltageSourceModel extends TwoTerminalModel {
  protected branch: UnknownIndex = 0;
  protected rInternal = 0;
  /** Small-signal stimulus from the acMagnitude / acPhase props (0 unless set). */
  protected ac: AcStimulus = { re: 0, im: 0 };

  protected abstract emf(t: number, step: StepInfo): number;

  protected applyProps(p: Props): void {
    this.rInternal = Math.max(0, num(p, "internalResistance", 0));
    this.ac = acStimulus(p);
  }

  override setup(ctx: SetupContext): void {
    super.setup(ctx);
    this.branch = ctx.allocBranch("i");
  }

  stampStep(s: Stamper, step: StepInfo): void {
    s.voltageSource(this.branch, this.a, this.b, this.emf(step.t, step) * step.sourceScale);
    if (this.rInternal > 0) s.matrix(this.branch, this.branch, -this.rInternal);
  }

  stampAC(s: ComplexStamper): void {
    s.voltageSource(this.branch, this.a, this.b, this.ac.re, this.ac.im);
    if (this.rInternal > 0) s.matrix(this.branch, this.branch, -this.rInternal, 0);
  }

  protected current(x: SolutionView): number {
    return x.x(this.branch);
  }

  override readouts(x: SolutionView, out: ReadoutSink): void {
    const v = this.voltage(x);
    const delivered = -this.current(x);
    out.add("voltage", v);
    out.add("current", delivered);
    out.add("power", v * delivered);
  }
}
