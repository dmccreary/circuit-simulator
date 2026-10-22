import type { DigitalContext, ModelFactory, ReadoutSink } from "../../api";
import { init } from "../../shared/modelKit";
import { not, type Logic } from "../levels";
import { LogicModel, packLogic, unpackLogic } from "../model";
import { bool, type Props } from "../../shared/props";

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

  /** True on a clean 1 → 0 clock transition; records the clock level. */
  protected fallingEdge(clk: Logic): boolean {
    const edge = this.lastClk === "1" && clk === "0";
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

/** Set/reset pins read Z (unconnected) as inactive; `invertSetReset` makes them active-low (CircuitJS1 FLAG_INVERT_SET_RESET). */
class DFlipFlopModel extends FlipFlopModel {
  private activeLevel: Logic = "1";

  protected override applyProps(p: Props): void {
    this.activeLevel = bool(p, "invertSetReset", false) ? "0" : "1";
  }

  evaluateDigital(ctx: DigitalContext): void {
    const d = this.read(ctx, 0);
    const clk = this.read(ctx, 1);
    const s = this.read(ctx, 4) === this.activeLevel;
    const r = this.read(ctx, 5) === this.activeLevel;
    const edge = this.risingEdge(clk);
    if (s && r) this.q = "X";
    else if (s) this.q = "1";
    else if (r) this.q = "0";
    else if (edge) this.q = d === "0" || d === "1" ? d : "X";
    this.output(ctx, 2);
  }
}

export const dFlipFlopModel: ModelFactory = (el) => init(new DFlipFlopModel(el), el);
