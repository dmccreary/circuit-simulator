// Base for digital chips run by the engine's digital kernel. Follows
// CircuitJS1's ChipElm: every pin has a boolean value; inputs read high only
// at a solid "1" (an unconnected input reads low, as CircuitJS1's 0 V does),
// execute() computes the outputs, and every output is then driven.
//
// State layout (saveState / savedState): [lastClock, value of pin 0, pin 1, ...].

import type { NetlistElement } from "@cs/model";
import type { DigitalContext, ModelFactory, ReadoutSink } from "../api";
import { init } from "../shared/modelKit";
import { LogicModel } from "../logic/model";
import type { Logic } from "../logic/levels";

export abstract class ChipModel extends LogicModel {
  override stateSize: number;
  /** Value per pin: the last input read, or the output driven. */
  protected v: boolean[];
  /** Outputs driven Z (tri-state) instead of their value. */
  protected z: boolean[];
  protected lastClock = false;
  private readonly outPins: number[];

  constructor(el: NetlistElement) {
    super(el);
    const n = el.nodes.length;
    this.stateSize = 1 + n;
    this.v = new Array<boolean>(n).fill(false);
    this.z = new Array<boolean>(n).fill(false);
    this.outPins = this.digitalPins.filter((p) => p.dir === "out").map((p) => p.pin);
  }

  initialize(): void {
    this.v.fill(false);
    this.z.fill(false);
    this.lastClock = false;
    this.reset();
  }

  /** Power-on values beyond all-low (a flip-flop's Q̄). */
  protected reset(): void {}

  /** Read every digital input, then compute the outputs into this.v. */
  protected abstract execute(): void;

  evaluateDigital(ctx: DigitalContext): void {
    for (const p of this.digitalPins) if (p.dir === "in") this.v[p.pin] = this.read(ctx, p.pin) === "1";
    this.execute();
    for (const pin of this.outPins) this.drive(ctx, pin, this.z[pin] ? "Z" : this.v[pin] ? "1" : "0");
  }

  /** Bits of consecutive pins as a number, pin `first` the least significant unless msbFirst. */
  protected word(first: number, count: number, msbFirst = false): number {
    let w = 0;
    for (let i = 0; i < count; i++) if (this.v[first + i]) w |= 1 << (msbFirst ? count - 1 - i : i);
    return w;
  }

  protected setWord(first: number, count: number, value: number, msbFirst = false): void {
    for (let i = 0; i < count; i++) this.v[first + i] = ((value >> (msbFirst ? count - 1 - i : i)) & 1) === 1;
  }

  protected override extraReadouts(out: ReadoutSink): void {
    for (const pin of this.outPins) out.add(`q${pin}`, this.v[pin] ? 1 : 0);
  }

  override saveState(out: Float64Array): void {
    out[0] = this.lastClock ? 1 : 0;
    this.v.forEach((b, i) => (out[1 + i] = b ? 1 : 0));
  }

  override loadState(from: Float64Array): void {
    this.lastClock = from[0] === 1;
    this.v.forEach((_, i) => (this.v[i] = from[1 + i] === 1));
  }
}

/** Model factory for a chip class taking (el, ...args). */
export function chipFactory<A extends unknown[]>(
  Model: new (el: NetlistElement, ...args: A) => ChipModel,
  ...args: A
): ModelFactory {
  return (el) => init(new Model(el, ...args), el);
}

export const isHigh = (s: Logic): boolean => s === "1";
