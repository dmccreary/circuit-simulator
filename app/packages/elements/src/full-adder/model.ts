import type { NetlistElement } from "@cs/model";
import type { ModelFactory } from "../api";
import { ChipModel, chipFactory } from "../chip-kit/model";
import { ADDER_BITS, ADDER_BUS_BITS, adderType } from "./descriptor";

/** CircuitJS1 FullAdderElm.execute(): S = A + B + Cin, carry out C. */
class AdderModel extends ChipModel {
  constructor(el: NetlistElement, private readonly bits: number) {
    super(el);
  }

  protected execute(): void {
    const b = this.bits;
    let c = this.v[3 * b] ? 1 : 0;
    for (let i = 0; i < b; i++) {
      const s = (this.v[i] ? 1 : 0) + (this.v[i + b] ? 1 : 0) + c;
      c = s > 1 ? 1 : 0;
      this.v[i + 2 * b] = (s & 1) === 1;
    }
    this.v[3 * b + 1] = c === 1;
  }
}

export const ADDER_MODELS: Record<string, ModelFactory> = Object.fromEntries([
  ...ADDER_BITS.map((b) => [adderType(b), chipFactory(AdderModel, b)]),
  ...ADDER_BUS_BITS.map((b) => [adderType(b, true), chipFactory(AdderModel, b)]),
]);
