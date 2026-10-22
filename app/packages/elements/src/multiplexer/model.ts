import type { NetlistElement } from "@cs/model";
import type { ModelFactory } from "../api";
import { ChipModel, chipFactory } from "../chip-kit/model";
import { MUX_BUS_SIZES, MUX_SELECT_BITS, muxBusType, muxType } from "./descriptor";

/** CircuitJS1 MultiplexerElm.execute(): Q = I[select]. */
class MuxModel extends ChipModel {
  constructor(el: NetlistElement, private readonly sel: number) {
    super(el);
  }

  protected execute(): void {
    const n = 1 << this.sel;
    this.v[n + this.sel] = this.v[this.word(n, this.sel)];
  }
}

/** Bus/bus mode: Q = input bus number `select`. */
class MuxBusModel extends ChipModel {
  constructor(el: NetlistElement, private readonly sel: number, private readonly width: number) {
    super(el);
  }

  protected execute(): void {
    const w = this.width;
    const n = 1 << this.sel;
    const s = this.word(n * w, this.sel);
    for (let i = 0; i < w; i++) this.v[n * w + this.sel + i] = this.v[s * w + i];
  }
}

export const MUX_MODELS: Record<string, ModelFactory> = Object.fromEntries([
  ...MUX_SELECT_BITS.map((sel) => [muxType(sel), chipFactory(MuxModel, sel)]),
  ...MUX_BUS_SIZES.map(([sel, w]) => [muxBusType(sel, w), chipFactory(MuxBusModel, sel, w)]),
]);
