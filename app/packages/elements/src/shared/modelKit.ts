import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ElementModel, ReadoutSink, SetupContext, SolutionView, StepInfo } from "../api";
import type { Props } from "./props";

/** Common plumbing for two-terminal models: node lookup, props, no state by default. */
export abstract class TwoTerminalModel implements ElementModel {
  stateSize = 0;
  protected a: NodeIndex = 0;
  protected b: NodeIndex = 0;

  constructor(el: NetlistElement) {
    this.a = el.nodes[0] ?? 0;
    this.b = el.nodes[1] ?? 0;
  }

  setup(ctx: SetupContext): void {
    this.a = ctx.nodes[0] ?? 0;
    this.b = ctx.nodes[1] ?? 0;
  }

  setProps(props: Props): void {
    this.applyProps(props);
  }

  protected abstract applyProps(props: Props): void;

  /** Current flowing into terminal 0, through the part, out of terminal 1. */
  protected abstract current(x: SolutionView): number;

  protected voltage(x: SolutionView): number {
    return x.v(this.a) - x.v(this.b);
  }

  accept(_x: SolutionView, _step: StepInfo): void {}

  readouts(x: SolutionView, out: ReadoutSink): void {
    const v = this.voltage(x);
    const i = this.current(x);
    out.add("voltage", v);
    out.add("current", i);
    out.add("power", v * i);
  }

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    const i = this.current(x);
    out[0] = i;
    out[1] = -i;
  }

  saveState(_out: Float64Array): void {}
  loadState(_from: Float64Array): void {}
}

/**
 * Finish building a model: apply props, then restore the part's savedState
 * from the document, or fall back to initial conditions. Done here rather
 * than in constructors because subclass fields are not yet initialized there.
 */
export function init<M extends ElementModel>(model: M, el: NetlistElement): M {
  model.setProps(el.props);
  if (model.stateSize > 0 && el.savedState && el.savedState.length >= model.stateSize) {
    model.loadState(Float64Array.from(el.savedState));
  } else {
    model.initialize?.();
  }
  return model;
}
