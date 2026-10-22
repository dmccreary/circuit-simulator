import type { DigitalContext, ModelFactory, ReadoutSink } from "../../api";
import { init } from "../../shared/modelKit";
import { LogicModel } from "../model";

class LogicOutputModel extends LogicModel {
  evaluateDigital(ctx: DigitalContext): void {
    this.read(ctx, 0);
  }

  protected override extraReadouts(out: ReadoutSink): void {
    out.add("state", this.state(0));
  }
}

export const logicOutputModel: ModelFactory = (el) => init(new LogicOutputModel(el), el);
