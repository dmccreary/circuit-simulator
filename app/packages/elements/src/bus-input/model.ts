import type { NetlistElement } from "@cs/model";
import type { ModelFactory } from "../api";
import { ChipModel, chipFactory } from "../chip-kit/model";
import { num, type Props } from "../shared/props";
import { BUS_INPUT_WIDTHS, busInputType } from "./descriptor";

/** CircuitJS1 BusLogicInputElm: bit z of `value` on terminal z. */
class BusInputModel extends ChipModel {
  private value = 0;

  constructor(el: NetlistElement, private readonly width: number) {
    super(el);
  }

  protected override applyProps(p: Props): void {
    this.value = Math.max(0, Math.round(num(p, "value", 0)));
  }

  protected execute(): void {
    this.setWord(0, this.width, this.value);
  }
}

export const BUS_INPUT_MODELS: Record<string, ModelFactory> = Object.fromEntries(
  BUS_INPUT_WIDTHS.map((w) => [busInputType(w), chipFactory(BusInputModel, w)]),
);
