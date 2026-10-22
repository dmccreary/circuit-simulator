import type { NetlistElement } from "@cs/model";
import type { ModelFactory } from "../api";
import { ChipModel, chipFactory } from "../chip-kit/model";
import { bool, type Props } from "../shared/props";
import { RING_COUNTER_BITS, ringCounterType } from "./descriptor";

/**
 * CircuitJS1 RingCounterElm.execute(): one output high at a time, advancing on
 * each rising clock edge unless CE̅ is high; reset (or no output high) selects Q0.
 */
class RingCounterModel extends ChipModel {
  private invertReset = true;

  constructor(el: NetlistElement, private readonly bits: number, private readonly inhibit: boolean) {
    super(el);
  }

  protected override applyProps(p: Props): void {
    this.invertReset = bool(p, "invertReset", true);
  }

  protected execute(): void {
    const n = this.bits;
    const running = !(this.inhibit && this.v[n + 2]);
    let i = 0;
    while (i < n && !this.v[i + 2]) i++;
    if (this.v[0] && !this.lastClock && running) {
      if (i < n) this.v[i++ + 2] = false;
      i %= n;
      this.v[i + 2] = true;
    }
    if (this.v[1] !== this.invertReset || i === n) {
      for (let k = 1; k < n; k++) this.v[k + 2] = false;
      this.v[2] = true;
    }
    this.lastClock = this.v[0];
  }
}

export const RING_COUNTER_MODELS: Record<string, ModelFactory> = Object.fromEntries(
  RING_COUNTER_BITS.flatMap((b) => [false, true].map((ce) => [ringCounterType(b, ce), chipFactory(RingCounterModel, b, ce)])),
);
