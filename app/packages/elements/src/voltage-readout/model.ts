import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ElementModel, ModelFactory, ReadoutSink, SetupContext, SolutionView, StepInfo } from "../api";

/** Stamps nothing; reports the node voltage. */
class VoltageReadoutModel implements ElementModel {
  readonly stateSize = 0;
  private node: NodeIndex;

  constructor(el: NetlistElement) {
    this.node = el.nodes[0] ?? 0;
  }

  setup(ctx: SetupContext): void {
    this.node = ctx.nodes[0] ?? 0;
  }

  setProps(): void {}
  accept(_x: SolutionView, _step: StepInfo): void {}

  readouts(x: SolutionView, out: ReadoutSink): void {
    out.add("voltage", x.v(this.node));
  }

  terminalCurrents(_x: SolutionView, out: Float64Array): void {
    out.fill(0);
  }

  saveState(): void {}
  loadState(): void {}
}

export const voltageReadoutModel: ModelFactory = (el) => new VoltageReadoutModel(el);
