import type { NetlistElement } from "@cs/model";
import type { ModelFactory } from "../api";
import { ChipModel, chipFactory } from "../chip-kit/model";
import { bool, type Props } from "../shared/props";
import { LATCH_BITS, latchType } from "./descriptor";

/** CircuitJS1 LatchElm.doLoad(): copy I to O on Ld's rising edge (or while Ld is high when not edge-triggered). */
class LatchModel extends ChipModel {
  private edge = true;

  constructor(el: NetlistElement, private readonly bits: number) {
    super(el);
  }

  protected override applyProps(p: Props): void {
    this.edge = bool(p, "edgeTriggered", true);
  }

  protected execute(): void {
    const b = this.bits;
    const ld = this.v[2 * b];
    if (ld && (!this.edge || !this.lastClock)) for (let i = 0; i < b; i++) this.v[b + i] = this.v[i];
    this.lastClock = ld;
  }
}

export const LATCH_MODELS: Record<string, ModelFactory> = Object.fromEntries(LATCH_BITS.map((b) => [latchType(b), chipFactory(LatchModel, b)]));
