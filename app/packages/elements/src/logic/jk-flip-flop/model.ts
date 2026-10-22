import type { DigitalContext, ModelFactory } from "../../api";
import { init } from "../../shared/modelKit";
import { FlipFlopModel } from "../d-flip-flop/model";
import { not } from "../levels";
import { bool, type Props } from "../../shared/props";

class JkFlipFlopModel extends FlipFlopModel {
  private falling = false;

  protected override applyProps(p: Props): void {
    this.falling = bool(p, "fallingEdge", false);
  }

  evaluateDigital(ctx: DigitalContext): void {
    const j = this.read(ctx, 0);
    const clk = this.read(ctx, 1);
    const k = this.read(ctx, 2);
    if (this.falling ? this.fallingEdge(clk) : this.risingEdge(clk)) {
      if (j === "0" && k === "0") {
        // hold
      } else if (j === "1" && k === "0") this.q = "1";
      else if (j === "0" && k === "1") this.q = "0";
      else if (j === "1" && k === "1") this.q = not(this.q);
      else this.q = "X";
    }
    this.output(ctx, 3);
  }
}

export const jkFlipFlopModel: ModelFactory = (el) => init(new JkFlipFlopModel(el), el);
