import type { ModelFactory, ReadoutSink, SetupContext, SolutionView, StepInfo, Stamper, UnknownIndex } from "../api";
import { init, TwoTerminalModel } from "../shared/modelKit";
import { num, type Props } from "../shared/props";

/** A 0 V source (plus optional burden resistance) whose branch current is the reading. */
class AmmeterModel extends TwoTerminalModel {
  private branch: UnknownIndex = 0;
  private burden = 0;

  protected applyProps(p: Props): void {
    this.burden = Math.max(0, num(p, "burdenResistance", 0));
  }

  override setup(ctx: SetupContext): void {
    super.setup(ctx);
    this.branch = ctx.allocBranch("i");
  }

  stampStep(s: Stamper, _step: StepInfo): void {
    s.voltageSource(this.branch, this.a, this.b, 0);
    if (this.burden > 0) s.matrix(this.branch, this.branch, -this.burden);
  }

  protected current(x: SolutionView): number {
    return x.x(this.branch);
  }

  override readouts(x: SolutionView, out: ReadoutSink): void {
    out.add("current", this.current(x));
    out.add("voltage", this.voltage(x));
  }
}

export const ammeterModel: ModelFactory = (el) => init(new AmmeterModel(el), el);
