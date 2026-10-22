import type { NetlistElement } from "@cs/model";
import type { ModelFactory } from "../api";
import { ChipModel, chipFactory } from "../chip-kit/model";
import { bool, type Props } from "../shared/props";
import { DEMUX_SELECT_BITS, demuxType } from "./descriptor";

/** CircuitJS1 DeMultiplexerElm.execute(): the selected output follows the input, the rest idle. */
class DemuxModel extends ChipModel {
  private idle = false;

  constructor(el: NetlistElement, private readonly sel: number) {
    super(el);
  }

  protected override applyProps(p: Props): void {
    this.idle = bool(p, "idleHigh", false);
  }

  protected execute(): void {
    const n = 1 << this.sel;
    const s = this.word(n, this.sel);
    for (let i = 0; i < n; i++) this.v[i] = this.idle;
    this.v[s] = this.v[n + this.sel];
  }
}

export const DEMUX_MODELS: Record<string, ModelFactory> = Object.fromEntries(
  DEMUX_SELECT_BITS.map((sel) => [demuxType(sel), chipFactory(DemuxModel, sel)]),
);
