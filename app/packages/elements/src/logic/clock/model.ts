import type { DigitalContext, ModelFactory, ReadoutSink } from "../../api";
import { init } from "../../shared/modelKit";
import { num, type Props } from "../../shared/props";
import { LogicModel } from "../model";

/** Relative tolerance so an evaluation that lands on an edge sees the new level. */
const EDGE_EPS = 1e-9;

/**
 * High for the first dutyCycle% of each period. The kernel re-evaluates a
 * source whenever one of its own events fires, so each evaluation drives the
 * present level and schedules the next edge.
 */
class ClockModel extends LogicModel {
  private frequency = 1000;
  private duty = 0.5;
  private phaseCycles = 0;

  protected override applyProps(p: Props): void {
    this.frequency = Math.max(1e-12, num(p, "frequency", 1000));
    this.duty = Math.min(1, Math.max(0, num(p, "dutyCycle", 50) / 100));
    this.phaseCycles = num(p, "phase", 0) / 360;
  }

  evaluateDigital(ctx: DigitalContext): void {
    const c = ctx.t * this.frequency + this.phaseCycles + EDGE_EPS;
    const k = Math.floor(c);
    const high = c - k < this.duty;
    this.drive(ctx, 0, high ? "1" : "0", 0);
    if (this.duty <= 0 || this.duty >= 1) return; // constant level
    const next = (high ? k + this.duty : k + 1) - this.phaseCycles;
    this.drive(ctx, 0, high ? "0" : "1", Math.max(0, next / this.frequency - ctx.t));
    this.seen[0] = high ? "1" : "0";
  }

  protected override extraReadouts(out: ReadoutSink): void {
    out.add("state", this.state(0));
    out.add("frequency", this.frequency);
  }
}

export const clockModel: ModelFactory = (el) => init(new ClockModel(el), el);
