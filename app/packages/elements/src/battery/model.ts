import type { ModelFactory, StepInfo } from "../api";
import { init } from "../shared/modelKit";
import { num, type Props } from "../shared/props";
import { VoltageSourceModel } from "../shared/voltageSourceModel";

export class DcSourceModel extends VoltageSourceModel {
  private v = 9;

  protected override applyProps(p: Props): void {
    super.applyProps(p);
    this.v = num(p, "voltage", 9);
  }

  protected emf(_t: number, step: StepInfo): number {
    return step.kind === "ac" ? 0 : this.v;
  }
}

export const batteryModel: ModelFactory = (el) => init(new DcSourceModel(el), el);
