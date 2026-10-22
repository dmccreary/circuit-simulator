// Minimal logic models for kernel tests, independent of @cs/elements. They
// follow the structural digital-model shape the kernel reads (digital/types.ts).

import type { DigitalContext, ModelFactory, SetupContext, SolutionView } from "@cs/elements";
import type { NetlistElement, PropValue } from "@cs/model";
import { lookup as analogLookup } from "./models";

type L = "0" | "1" | "X" | "Z";
const LEVELS = { vHigh: 5, vLow: 0, rOut: 10, vth: 2.5, vRise: 2.5, vFall: 2.5 };
const num = (p: Record<string, PropValue>, k: string, d: number) => (typeof p[k] === "number" ? (p[k] as number) : d);

abstract class Logic {
  stateSize = 0;
  levels = LEVELS;
  digitalPins: { pin: number; dir: "in" | "out" }[] = [];
  delay = 0;
  setup(_ctx: SetupContext): void {}
  setProps(p: Record<string, PropValue>): void {
    this.delay = num(p, "delay", 0);
    this.apply(p);
  }
  apply(_p: Record<string, PropValue>): void {}
  accept(): void {}
  readouts(): void {}
  terminalCurrents(_x: SolutionView, out: Float64Array): void {
    out.fill(0);
  }
  saveState(): void {}
  loadState(): void {}
  abstract evaluateDigital(ctx: DigitalContext): void;
}

const FNS: Record<string, (i: L[]) => L> = {
  buf: (i) => (i[0] === "0" || i[0] === "1" ? i[0] : "X"),
  not: (i) => (i[0] === "1" ? "0" : i[0] === "0" ? "1" : "X"),
  and: (i) => (i.includes("0") ? "0" : i.every((s) => s === "1") ? "1" : "X"),
  or: (i) => (i.includes("1") ? "1" : i.every((s) => s === "0") ? "0" : "X"),
};

/** Gate with inputs 0..n-2 and output n-1; prop fn: buf | not | and | or. */
class Gate extends Logic {
  fn = FNS.buf;
  constructor(private n: number) {
    super();
    this.digitalPins = Array.from({ length: n }, (_, k) => ({ pin: k, dir: k === n - 1 ? "out" : "in" }));
  }
  override apply(p: Record<string, PropValue>) {
    this.fn = FNS[String(p.fn ?? "buf")] ?? FNS.buf;
  }
  evaluateDigital(ctx: DigitalContext) {
    const ins: L[] = [];
    for (let k = 0; k < this.n - 1; k++) ins.push(ctx.input(k));
    ctx.schedule(this.n - 1, this.fn(ins), this.delay);
  }
}

/** Logic source: prop `value` ("0" | "1" | "X" | "Z"), optional `edgeAt` time to switch to `after`. */
class Source extends Logic {
  value: L = "0";
  after: L = "1";
  edgeAt = Infinity;
  override digitalPins = [{ pin: 0, dir: "out" as const }];
  override apply(p: Record<string, PropValue>) {
    this.value = String(p.value ?? "0") as L;
    this.after = String(p.after ?? "1") as L;
    this.edgeAt = num(p, "edgeAt", Infinity);
  }
  evaluateDigital(ctx: DigitalContext) {
    const now = ctx.t >= this.edgeAt * (1 - 1e-12) ? this.after : this.value;
    ctx.schedule(0, now, 0);
    if (ctx.t < this.edgeAt * (1 - 1e-12) && Number.isFinite(this.edgeAt)) ctx.schedule(0, this.after, this.edgeAt - ctx.t);
  }
}

class Probe extends Logic {
  seen: L = "X";
  override digitalPins = [{ pin: 0, dir: "in" as const }];
  evaluateDigital(ctx: DigitalContext) {
    this.seen = ctx.input(0);
  }
}

const make = <T extends Logic>(m: T, el: NetlistElement): T => {
  m.setProps(el.props);
  return m;
};

const digital: Record<string, ModelFactory> = {
  gate1: (el) => make(new Gate(2), el),
  gate2: (el) => make(new Gate(3), el),
  dsrc: (el) => make(new Source(), el),
  dprobe: (el) => make(new Probe(), el),
};

export const lookup = (type: string): ModelFactory | undefined => digital[type] ?? analogLookup(type);
export { netlist } from "./models";
