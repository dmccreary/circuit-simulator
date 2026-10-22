import type { DigitalContext, ModelFactory, ReadoutSink } from "../../api";
import { init } from "../../shared/modelKit";
import { not, type Logic } from "../levels";
import { LogicModel, packLogic, unpackLogic } from "../model";

/**
 * Edge-triggered storage shared by the flip-flops: the stored bit and the
 * clock level seen at the previous evaluation (state, so restarts replay).
 */
export abstract class FlipFlopModel extends LogicModel {
  override stateSize = 2;
  protected q: Logic = "0";
  protected lastClk: Logic = "X";

  initialize(): void {
    this.q = "0";
    this.lastClk = "X";
  }

  /** True on a clean 0 → 1 clock transition; records the clock level. */
  protected risingEdge(clk: Logic): boolean {
    const edge = this.lastClk === "0" && clk === "1";
    this.lastClk = clk;
    return edge;
  }

  protected output(ctx: DigitalContext, qPin: number): void {
    this.drive(ctx, qPin, this.q);
    this.drive(ctx, qPin + 1, not(this.q));
  }

  protected override extraReadouts(out: ReadoutSink): void {
    out.add("q", this.q === "1" ? 1 : this.q === "0" ? 0 : 0.5);
  }

  override saveState(out: Float64Array): void {
    out[0] = packLogic(this.q);
    out[1] = packLogic(this.lastClk);
  }

  override loadState(from: Float64Array): void {
    this.q = unpackLogic(from[0]);
    this.lastClk = unpackLogic(from[1]);
  }
}

/** Set/reset pins read Z (unconnected) as inactive. */
const active = (s: Logic) => s === "1";

class DFlipFlopModel extends FlipFlopModel {
  evaluateDigital(ctx: DigitalContext): void {
    const d = this.read(ctx, 0);
    const clk = this.read(ctx, 1);
    const s = active(this.read(ctx, 4));
    const r = active(this.read(ctx, 5));
    const edge = this.risingEdge(clk);
    if (s && r) this.q = "X";
    else if (s) this.q = "1";
    else if (r) this.q = "0";
    else if (edge) this.q = d === "0" || d === "1" ? d : "X";
    this.output(ctx, 2);
  }
}

export const dFlipFlopModel: ModelFactory = (el) => init(new DFlipFlopModel(el), el);
