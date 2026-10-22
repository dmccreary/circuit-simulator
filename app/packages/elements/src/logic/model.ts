// Base for logic part models. Logic parts stamp nothing themselves: the
// engine's digital kernel reads `digitalPins` and `levels`, calls
// evaluateDigital, and stamps the bridges where pins meet analog nodes.

import type { NetlistElement, NodeIndex } from "@cs/model";
import type { DigitalContext, ElementModel, ReadoutSink, SetupContext, SolutionView, StepInfo } from "../api";
import { levelsFromProps, logicNumber, type DigitalLevels, type Logic } from "./levels";
import { DIGITAL_PINS, type DigitalPin } from "./pins";
import { num, type Props } from "../shared/props";

export abstract class LogicModel implements ElementModel {
  stateSize = 0;
  readonly digitalPins: readonly DigitalPin[];
  levels: DigitalLevels = levelsFromProps({});
  protected delay = 0;
  protected nodes: NodeIndex[];
  /** Last value seen or driven per terminal, for readouts. */
  protected seen: Logic[];

  constructor(el: NetlistElement) {
    this.digitalPins = DIGITAL_PINS[el.type] ?? [];
    this.nodes = el.nodes.slice();
    this.seen = el.nodes.map(() => "X");
  }

  setup(ctx: SetupContext): void {
    this.nodes = ctx.nodes.slice();
  }

  setProps(p: Props): void {
    this.levels = levelsFromProps(p);
    this.delay = Math.max(0, num(p, "delay", 0));
    this.applyProps(p);
  }

  protected applyProps(_p: Props): void {}

  abstract evaluateDigital(ctx: DigitalContext): void;

  /** Read an input and remember it. */
  protected read(ctx: DigitalContext, pin: number): Logic {
    const v = ctx.input(pin);
    this.seen[pin] = v;
    return v;
  }

  /** Drive an output after the part's delay and remember it. */
  protected drive(ctx: DigitalContext, pin: number, v: Logic, delay = this.delay): void {
    this.seen[pin] = v;
    ctx.schedule(pin, v, delay);
  }

  accept(_x: SolutionView, _step: StepInfo): void {}

  readouts(x: SolutionView, out: ReadoutSink): void {
    this.extraReadouts(out);
    out.add("voltage", x.v(this.nodes[this.nodes.length - 1] ?? 0));
  }

  protected extraReadouts(_out: ReadoutSink): void {}

  protected state(pin: number): number {
    return logicNumber(this.seen[pin] ?? "X");
  }

  /** Inputs draw no current; output bridge currents are added by the engine. */
  terminalCurrents(_x: SolutionView, out: Float64Array): void {
    out.fill(0);
  }

  saveState(_out: Float64Array): void {}
  loadState(_from: Float64Array): void {}
}

/** Pack/unpack logic values for saveState (0, 1, 2 = X, 3 = Z). */
export const packLogic = (s: Logic): number => (s === "0" ? 0 : s === "1" ? 1 : s === "X" ? 2 : 3);
export const unpackLogic = (v: number): Logic => (v === 0 ? "0" : v === 1 ? "1" : v === 3 ? "Z" : "X");
