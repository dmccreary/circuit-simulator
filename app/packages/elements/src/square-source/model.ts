import type { ModelFactory, ReadoutSink, SolutionView, StepInfo } from "../api";
import { init } from "../shared/modelKit";
import { num, type Props } from "../shared/props";
import { VoltageSourceModel } from "../shared/voltageSourceModel";

/** Relative tolerance so a step that lands on an edge sees the new level. */
const EDGE_EPS = 1e-9;
const MAX_BREAKPOINTS = 1000;

/** High (offset + amplitude) for the first dutyCycle% of each period, then low (offset - amplitude). */
class SquareSourceModel extends VoltageSourceModel {
  private amplitude = 5;
  private frequency = 1000;
  private offset = 0;
  private phaseCycles = 0;
  private duty = 0.5;

  protected override applyProps(p: Props): void {
    super.applyProps(p);
    this.amplitude = num(p, "amplitude", 5);
    this.frequency = Math.max(1e-12, num(p, "frequency", 1000));
    this.offset = num(p, "offset", 0);
    this.phaseCycles = num(p, "phase", 0) / 360;
    this.duty = Math.min(1, Math.max(0, num(p, "dutyCycle", 50) / 100));
  }

  /** Position within the period, 0..1. */
  private cyclePos(t: number): number {
    const c = t * this.frequency + this.phaseCycles + EDGE_EPS;
    return c - Math.floor(c);
  }

  protected emf(t: number, step: StepInfo): number {
    if (step.kind === "ac") return 0;
    return this.offset + (this.cyclePos(t) < this.duty ? this.amplitude : -this.amplitude);
  }

  /** Rising edges at cycle k, falling edges at cycle k + duty, for t in (t0, t1]. */
  breakpoints(t0: number, t1: number, out: number[]): void {
    if (!(t1 > t0)) return;
    const f = this.frequency;
    const first = Math.floor(t0 * f + this.phaseCycles) - 1;
    let pushed = 0;
    for (let k = first; pushed < MAX_BREAKPOINTS; k++) {
      const rise = (k - this.phaseCycles) / f;
      if (rise > t1) break;
      for (const edge of [rise, (k + this.duty - this.phaseCycles) / f]) {
        if (edge > t0 && edge <= t1) {
          out.push(edge);
          pushed++;
        }
      }
    }
  }

  override readouts(x: SolutionView, out: ReadoutSink): void {
    super.readouts(x, out);
    out.add("frequency", this.frequency);
  }
}

export const squareSourceModel: ModelFactory = (el) => init(new SquareSourceModel(el), el);
