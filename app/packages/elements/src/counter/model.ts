import type { NetlistElement } from "@cs/model";
import type { ModelFactory } from "../api";
import { ChipModel, chipFactory } from "../chip-kit/model";
import { bool, num, type Props } from "../shared/props";
import { COUNTER_BITS, counterType, SYNC_COUNTER_BITS, SYNC_COUNTER_BUS_BITS, syncCounterType } from "./descriptor";

/** CircuitJS1 CounterElm.execute(): count on the clock edge, clear while R is active. */
class CounterModel extends ChipModel {
  private modulus = 0;
  private invertReset = false;
  private negEdge = false;

  constructor(el: NetlistElement, private readonly bits: number) {
    super(el);
  }

  protected override applyProps(p: Props): void {
    this.modulus = Math.max(0, Math.round(num(p, "modulus", 0)));
    this.invertReset = bool(p, "invertReset", false);
    this.negEdge = bool(p, "negativeEdge", false);
  }

  protected execute(): void {
    const clk = this.v[0];
    if (clk !== this.negEdge && this.lastClock === this.negEdge) {
      let value = this.word(2, this.bits, true) + 1;
      if (this.modulus !== 0) value %= this.modulus;
      this.setWord(2, this.bits, value, true);
    }
    if (!this.v[1] === this.invertReset) for (let i = 0; i < this.bits; i++) this.v[2 + i] = false;
    this.lastClock = clk;
  }
}

/** CircuitJS1 Counter2Elm.execute(): synchronous count, load and clear; RCO at the terminal count. */
class SyncCounterModel extends ChipModel {
  private modulus = 0;
  private carry = false;

  constructor(el: NetlistElement, private readonly bits: number) {
    super(el);
  }

  protected override applyProps(p: Props): void {
    this.modulus = Math.max(0, Math.round(num(p, "modulus", 0)));
  }

  protected execute(): void {
    const b = this.bits;
    const [clk, clr, enp, rco, load, ent] = [2 * b, 2 * b + 1, 2 * b + 2, 2 * b + 3, 2 * b + 4, 2 * b + 5];
    const realmod = this.modulus === 0 ? 1 << b : this.modulus;
    if (this.v[clk] && !this.lastClock) {
      if (this.v[enp] && this.v[ent]) {
        const value = (this.word(0, b, true) + 1) % realmod;
        this.setWord(0, b, value, true);
        this.carry = value === realmod - 1;
      }
      if (!this.v[load]) {
        for (let i = 0; i < b; i++) this.v[i] = this.v[i + b];
        this.carry = this.word(0, b, true) === realmod - 1;
      }
    }
    if (!this.v[clr]) {
      for (let i = 0; i < b; i++) this.v[i] = false;
      this.carry = false;
    }
    this.lastClock = this.v[clk];
    this.v[rco] = this.carry && this.v[ent];
  }

  override loadState(from: Float64Array): void {
    super.loadState(from);
    this.carry = this.v[2 * this.bits + 3];
  }
}

export const COUNTER_MODELS: Record<string, ModelFactory> = {
  ...Object.fromEntries(COUNTER_BITS.map((b) => [counterType(b), chipFactory(CounterModel, b)])),
  ...Object.fromEntries(SYNC_COUNTER_BITS.map((b) => [syncCounterType(b), chipFactory(SyncCounterModel, b)])),
  ...Object.fromEntries(SYNC_COUNTER_BUS_BITS.map((b) => [syncCounterType(b, true), chipFactory(SyncCounterModel, b)])),
};
