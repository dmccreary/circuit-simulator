// Ratings and failure as model state (simulation-engine.md §5, RLM-05–07).
//
// withRatings() wraps any model factory. The wrapper heats the part after every
// accepted step (thermal.ts), and when the engine asks for stress() with
// realistic ratings on, a part whose θ passed its limit switches into its
// failure mode and reports it once, so the engine can emit partFailed. The
// part keeps its identity, label and probes; only its stamps change:
//
//   open   the inner stamps are dropped and 1 pS joins the first two terminals
//          (any branch current the inner model owns is pinned to zero);
//   short  a 10 mΩ path joins the short pair, on top of the inner stamps.
//
// The document records a failure in the `failed` prop so Reset keeps it and
// Repair (or Undo) clears it as an ordinary edit (RLM-07). setProps acts on
// that prop only when it changes, so other value edits never repair a part.

import type { NetlistElement, NodeIndex } from "@cs/model";
import type {
  ComplexStamper,
  DigitalContext,
  ElementModel,
  ModelFactory,
  ReadoutSink,
  SetupContext,
  SolutionView,
  Stamper,
  StepInfo,
  StressReport,
  UnknownIndex,
} from "../api";
import type { Props } from "./props";
import { failThreshold, failedMode, ratingStress, ratingsFor, type FailMode, type RatingSpec } from "./ratings";
import { heatStep, temperatureOf } from "./thermal";

const G_OPEN = 1e-12;
const G_SHORT = 100; // 10 mΩ

class RatedModel {
  readonly stateSize: number;
  readonly nonlinear?: boolean;
  private nodes: NodeIndex[];
  private branches: UnknownIndex[] = [];
  private props: Props = {};
  private theta: Float64Array;
  private mode: FailMode | undefined;
  /** Last value of the `failed` prop seen by setProps (or set by a failure). */
  private lastFailedProp: string | undefined;
  private volts: Float64Array;
  private currents: Float64Array;

  constructor(
    private inner: ElementModel,
    private specs: readonly RatingSpec[],
    el: NetlistElement,
  ) {
    this.stateSize = inner.stateSize + specs.length;
    this.nonlinear = inner.nonlinear;
    this.nodes = el.nodes.slice();
    this.theta = new Float64Array(specs.length);
    this.volts = new Float64Array(el.nodes.length);
    this.currents = new Float64Array(el.nodes.length);
  }

  get failed(): FailMode | undefined {
    return this.mode;
  }

  setup(ctx: SetupContext): void {
    this.nodes = ctx.nodes.slice();
    this.branches = [];
    this.inner.setup({
      nodes: ctx.nodes,
      allocBranch: (name) => {
        const b = ctx.allocBranch(name);
        this.branches.push(b);
        return b;
      },
    });
  }

  setProps(props: Props): void {
    this.props = props;
    this.inner.setProps(props);
    // Only an explicit change of the prop acts: a part that failed in the engine
    // stays failed through other edits until the document says otherwise.
    const f = typeof props.failed === "string" ? props.failed : undefined;
    if (f === undefined || f === this.lastFailedProp) return;
    this.lastFailedProp = f;
    const next = failedMode(props);
    if (!next && this.mode) this.theta.fill(0); // repaired: a new, cold part
    this.mode = next;
  }

  /** Terminal indexes joined by a short failure. */
  private shortPair(): [number, number] {
    return this.specs.find((s) => s.failMode === "short")?.shortPair ?? [0, 1];
  }

  private shortNodes(): [NodeIndex, NodeIndex] {
    const [p, q] = this.shortPair();
    return [this.nodes[p] ?? 0, this.nodes[q] ?? 0];
  }

  private stampFailure(s: Stamper): void {
    if (this.mode === "open") {
      s.conductance(this.nodes[0] ?? 0, this.nodes[1] ?? 0, G_OPEN);
      for (const b of this.branches) s.matrix(b, b, 1);
    } else if (this.mode === "short") {
      const [a, b] = this.shortNodes();
      s.conductance(a, b, G_SHORT);
    }
  }

  stampStatic(s: Stamper): void {
    if (this.mode !== "open") this.inner.stampStatic?.(s);
    this.stampFailure(s);
  }

  stampStep(s: Stamper, step: StepInfo): void {
    if (this.mode !== "open") this.inner.stampStep?.(s, step);
  }

  stampNewton(s: Stamper, x: SolutionView, step: StepInfo): void {
    if (this.mode !== "open") this.inner.stampNewton?.(s, x, step);
  }

  stampAC(s: ComplexStamper, op: SolutionView, omega: number): void {
    if (this.mode === "open") {
      s.admittance(this.nodes[0] ?? 0, this.nodes[1] ?? 0, G_OPEN, 0);
      for (const b of this.branches) s.matrix(b, b, 1, 0);
      return;
    }
    this.inner.stampAC?.(s, op, omega);
    if (this.mode === "short") {
      const [a, b] = this.shortNodes();
      s.admittance(a, b, G_SHORT, 0);
    }
  }

  hasConverged(x: SolutionView, previous: SolutionView): boolean {
    return this.mode === "open" || (this.inner.hasConverged?.(x, previous) ?? true);
  }

  /** Terminal voltages and currents into this.volts / this.currents. */
  private sense(x: SolutionView): void {
    for (let i = 0; i < this.nodes.length; i++) this.volts[i] = x.v(this.nodes[i]);
    this.terminalCurrents(x, this.currents);
  }

  accept(x: SolutionView, step: StepInfo): void {
    if (this.mode !== "open") this.inner.accept(x, step);
    if (step.kind !== "transient" || !(step.dt > 0)) return;
    this.sense(x);
    this.specs.forEach((spec, i) => {
      const s = this.mode ? 0 : ratingStress(spec, this.props, this.volts, this.currents);
      this.theta[i] = heatStep(this.theta[i], s, step.dt, spec.tau);
    });
  }

  initialize(): void {
    this.inner.initialize?.();
    this.theta.fill(0);
  }

  truncationError(x: SolutionView, step: StepInfo): number {
    return this.mode === "open" ? 0 : (this.inner.truncationError?.(x, step) ?? 0);
  }

  breakpoints(t0: number, t1: number, out: number[]): void {
    this.inner.breakpoints?.(t0, t1, out);
  }

  evaluateDigital(ctx: DigitalContext): void {
    this.inner.evaluateDigital?.(ctx);
  }

  /** Heat as a fraction of the failure point, the largest over this part's ratings. */
  private heat(): { frac: number; worst: number } {
    let frac = 0;
    let worst = 0;
    this.specs.forEach((spec, i) => {
      const f = this.theta[i] / failThreshold(spec);
      if (f > frac) {
        frac = f;
        worst = i;
      }
    });
    return { frac, worst };
  }

  readouts(x: SolutionView, out: ReadoutSink): void {
    if (!this.mode) this.inner.readouts(x, out);
    else {
      // A failed part's current and power come from its failure path, not its own law.
      this.sense(x);
      let p = 0;
      for (let i = 0; i < this.currents.length; i++) p += this.volts[i] * this.currents[i];
      const fixed: Record<string, number> = { current: this.currents[0], power: p };
      this.inner.readouts(x, { add: (k, v) => out.add(k, k in fixed ? fixed[k] : v) });
    }
    const { frac } = this.heat();
    out.add("heat", Math.min(1, frac));
    out.add("temperature", temperatureOf(frac, 1));
    out.add("failed", this.mode === "open" ? 1 : this.mode === "short" ? 2 : 0);
  }

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    if (this.mode === "open") {
      const i = G_OPEN * (x.v(this.nodes[0] ?? 0) - x.v(this.nodes[1] ?? 0));
      out.fill(0);
      out[0] = i;
      if (out.length > 1) out[1] = -i;
      return;
    }
    this.inner.terminalCurrents(x, out);
    if (this.mode === "short") {
      const p = this.shortPair();
      const i = G_SHORT * (x.v(this.nodes[p[0]] ?? 0) - x.v(this.nodes[p[1]] ?? 0));
      out[p[0]] += i;
      out[p[1]] -= i;
    }
  }

  /**
   * Called by the engine after each accepted step when realistic ratings are
   * on. Reports failMode only on the step the part fails.
   */
  stress(_x: SolutionView, _step: StepInfo): StressReport | undefined {
    const { frac, worst } = this.heat();
    if (this.mode) return { overLimit: false, temperature: temperatureOf(frac, 1) };
    let over = false;
    this.specs.forEach((spec) => {
      if (ratingStress(spec, this.props, this.volts, this.currents) > 1) over = true;
    });
    if (frac >= 1) {
      this.mode = this.specs[worst].failMode;
      // The document will echo this as the `failed` prop; only a later change repairs.
      this.lastFailedProp = this.mode;
      return { overLimit: true, temperature: temperatureOf(frac, 1), failMode: this.mode };
    }
    return { overLimit: over, temperature: temperatureOf(frac, 1) };
  }

  saveState(out: Float64Array): void {
    const n = this.inner.stateSize;
    if (n > 0) this.inner.saveState(out.subarray(0, n));
    out.set(this.theta, n);
  }

  loadState(from: Float64Array): void {
    const n = this.inner.stateSize;
    if (n > 0) this.inner.loadState(from.slice(0, n));
    if (from.length >= n + this.theta.length) this.theta.set(from.subarray(n, n + this.theta.length));
  }
}

const OPTIONAL = ["stampStatic", "stampStep", "stampNewton", "stampAC", "hasConverged", "initialize", "truncationError", "breakpoints", "evaluateDigital"] as const;

/**
 * A model factory whose parts heat and can fail. Optional methods the inner
 * model lacks stay absent (the engine treats "absent" differently from "no-op",
 * for example the AC fallback), except the stamps a failure needs.
 */
export function withRatings(factory: ModelFactory, specs: readonly RatingSpec[]): ModelFactory {
  return (el) => {
    const inner = factory(el);
    const m = new RatedModel(inner, specs, el);
    for (const k of OPTIONAL) {
      if (k === "stampStatic" || k === "hasConverged" || k === "initialize") continue;
      if (inner[k] === undefined) (m as unknown as Record<string, unknown>)[k] = undefined;
    }
    // Props were applied to the inner model by its own factory; apply them again
    // here so the wrapper sees ratings and the `failed` prop.
    m.setProps(el.props);
    if (el.savedState && el.savedState.length >= m.stateSize) m.loadState(Float64Array.from(el.savedState));
    return m as unknown as ElementModel;
  };
}

/** Wrap a factory when its type has ratings (RLM-04); others pass through unchanged. */
export function ratedFactory(type: string, factory: ModelFactory | undefined): ModelFactory | undefined {
  if (!factory) return undefined;
  const specs = ratingsFor(type);
  return specs.length ? withRatings(factory, specs) : factory;
}

/** For tests and read-outs: the failure mode of a model built by withRatings. */
export function failureOf(model: ElementModel): FailMode | undefined {
  return model instanceof RatedModel ? model.failed : undefined;
}
