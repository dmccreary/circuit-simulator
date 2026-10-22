import type { DigitalContext, ModelFactory, ReadoutSink } from "../../api";
import { init } from "../../shared/modelKit";
import { bool, type Props } from "../../shared/props";
import { LogicModel } from "../model";

class LogicInputModel extends LogicModel {
  private high = false;

  protected override applyProps(p: Props): void {
    this.high = bool(p, "high", false);
  }

  evaluateDigital(ctx: DigitalContext): void {
    this.drive(ctx, 0, this.high ? "1" : "0", 0);
  }

  protected override extraReadouts(out: ReadoutSink): void {
    out.add("state", this.high ? 1 : 0);
  }
}

export const logicInputModel: ModelFactory = (el) => init(new LogicInputModel(el), el);
