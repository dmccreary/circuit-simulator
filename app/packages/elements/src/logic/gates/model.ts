import type { NetlistElement } from "@cs/model";
import type { DigitalContext, ModelFactory, ReadoutSink } from "../../api";
import { init } from "../../shared/modelKit";
import { and, not, or, xor, type Logic } from "../levels";
import { LogicModel } from "../model";

type Fn = (ins: Logic[]) => Logic;

/** Combinational gate: output = fn(inputs) after the delay. */
class GateModel extends LogicModel {
  constructor(
    el: NetlistElement,
    private readonly fn: Fn,
    private readonly nIn: number,
  ) {
    super(el);
  }

  evaluateDigital(ctx: DigitalContext): void {
    const ins: Logic[] = [];
    for (let i = 0; i < this.nIn; i++) ins.push(this.read(ctx, i));
    this.drive(ctx, this.nIn, this.fn(ins));
  }

  protected override extraReadouts(out: ReadoutSink): void {
    out.add("output", this.state(this.nIn));
  }
}

const factory =
  (fn: Fn, nIn = 2): ModelFactory =>
  (el) =>
    init(new GateModel(el, fn, nIn), el);

export const andGateModel = factory(and);
export const orGateModel = factory(or);
export const nandGateModel = factory((i) => not(and(i)));
export const norGateModel = factory((i) => not(or(i)));
export const xorGateModel = factory(xor);
export const notGateModel = factory((i) => not(i[0]), 1);

/** Gates with more than two inputs ("and-gate-3"). */
export function wideGateModels(counts: readonly number[]): Record<string, ModelFactory> {
  const out: Record<string, ModelFactory> = {};
  for (const n of counts) {
    out[`and-gate-${n}`] = factory(and, n);
    out[`or-gate-${n}`] = factory(or, n);
    out[`nand-gate-${n}`] = factory((i) => not(and(i)), n);
    out[`nor-gate-${n}`] = factory((i) => not(or(i)), n);
  }
  return out;
}
