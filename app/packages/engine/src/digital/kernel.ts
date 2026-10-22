// The event-driven digital kernel (simulation-engine.md §4).
//
// - Events (time, driver, value) wait in a queue. Evaluating a part schedules
//   its outputs after the part's delay with transport semantics: a new event
//   cancels the driver's pending events at or after its time, so pulses
//   shorter than the delay still appear (glitches, DIG-05).
// - Zero-delay events run as delta cycles at the same time.
// - Nets touching only digital pins never need the analog solution: their
//   rows are pinned to the logic level. Nets that also touch analog pins are
//   analog nodes with bridges: each digital output stamps a voltage source
//   behind its output resistance (D→A, DIG-04) and each digital input senses
//   the node voltage through its thresholds, with hysteresis for Schmitt
//   inputs (A→D).

import type { DigitalContext, Stamper } from "@cs/elements";
import type { Circuit } from "../circuit";
import { EventQueue, type DigitalEvent } from "./queue";
import {
  asDigital,
  DISCRETE_ANALOG,
  levelOf,
  logicCode,
  logicSample,
  type DigitalLevelsDecl,
  type DigitalModelLike,
  type Logic,
} from "./types";

/** Delta cycles at one instant before the circuit is declared oscillating. */
const MAX_DELTAS = 10000;
const R_MIN = 1e-6;
/** Threshold for logic channels on purely analog nodes. */
const ANALOG_LOGIC_THRESHOLD = 2.5;

export class DigitalOscillation extends Error {
  constructor(readonly elements: string[], readonly t: number) {
    super("digital oscillation");
  }
}

interface Driver {
  el: number;
  pin: number;
  node: number;
  value: Logic;
  /** Pending events of this driver, in time order. */
  pending: DigitalEvent[];
}

interface Input {
  el: number;
  pin: number;
  node: number;
  sensed: Logic;
  known: boolean;
}

interface Net {
  /** Only digital pins: the row is pinned to the logic level. */
  digital: boolean;
  /** Has digital pins (digital or mixed). */
  hasDigital: boolean;
  drivers: number[];
  inputs: number[];
  /** Digital elements with a pin on this net, ascending. */
  members: number[];
  state: Logic;
}

export interface DigitalSnapshot {
  values: Logic[];
  sensed: Logic[];
  known: boolean[];
  states: Logic[];
  events: [number, number, number, Logic][];
  seq: number;
}

const timeTol = (t: number) => Math.max(1e-21, Math.abs(t) * 1e-12);

export class DigitalKernel {
  /** No analog parts at all: the engine advances event to event without a matrix. */
  readonly pure: boolean;
  private readonly dm: (DigitalModelLike | null)[];
  private readonly drivers: Driver[] = [];
  private readonly inputs: Input[] = [];
  private readonly nets: Net[] = [];
  private readonly driverOf: Int32Array[] = [];
  private readonly inputOf: Int32Array[] = [];
  private readonly isSource: boolean[] = [];
  private readonly queue = new EventQueue();
  private readonly marked: Uint8Array;
  private seq = 0;
  private t = 0;
  private analogDirty = false;
  private levelDirty = false;

  static create(c: Circuit): DigitalKernel | null {
    return c.models.some((m) => asDigital(m)) ? new DigitalKernel(c) : null;
  }

  private constructor(private readonly c: Circuit) {
    const els = c.netlist.elements;
    this.dm = c.models.map((m) => asDigital(m));
    this.marked = new Uint8Array(els.length);
    for (let n = 0; n <= c.nodeCount; n++)
      this.nets.push({ digital: false, hasDigital: false, drivers: [], inputs: [], members: [], state: "Z" });
    const analogPin = new Uint8Array(c.nodeCount + 1);
    analogPin[0] = 1; // ground is an analog node at 0 V
    els.forEach((el, i) => {
      const nT = el.nodes.length;
      this.driverOf.push(new Int32Array(nT).fill(-1));
      this.inputOf.push(new Int32Array(nT).fill(-1));
      const d = this.dm[i];
      this.isSource.push(!!d && !d.digitalPins.some((p) => p.dir === "in"));
      if (!c.models[i]) return;
      const dir = new Map<number, "in" | "out">();
      for (const p of d?.digitalPins ?? []) dir.set(p.pin, p.dir);
      el.nodes.forEach((n, k) => {
        const kind = dir.get(k);
        if (!kind) {
          analogPin[n] = 1;
          return;
        }
        const net = this.nets[n];
        net.hasDigital = true;
        if (net.members[net.members.length - 1] !== i) net.members.push(i);
        if (kind === "out") {
          this.driverOf[i][k] = this.drivers.length;
          net.drivers.push(this.drivers.length);
          this.drivers.push({ el: i, pin: k, node: n, value: "X", pending: [] });
        } else {
          this.inputOf[i][k] = this.inputs.length;
          net.inputs.push(this.inputs.length);
          this.inputs.push({ el: i, pin: k, node: n, sensed: "X", known: false });
        }
      });
    });
    this.nets.forEach((net, n) => {
      net.digital = net.hasDigital && !analogPin[n];
      net.state = this.resolve(net);
    });
    this.pure = c.models.every((m, i) => !m || this.dm[i]);
    this.markAll();
  }

  // ------------------------------------------------------------ queries

  /** Time of the earliest pending event, if any. */
  nextTime(): number | undefined {
    return this.queue.peek()?.t;
  }

  /** Logic channel value for a node, given the display state (see logicSample). */
  logicOf(node: number, display: Float64Array): number {
    return logicSample(this.netLogic(node, display));
  }

  /** One byte per node: logicCode, or DISCRETE_ANALOG for nodes with no digital pins. */
  logicStates(display: Float64Array): Uint8Array {
    const out = new Uint8Array(this.nets.length);
    this.nets.forEach((net, n) => {
      out[n] = net.hasDigital ? logicCode(this.netLogic(n, display)) : DISCRETE_ANALOG;
    });
    return out;
  }

  /** Solution vector for a purely digital circuit: every node at its logic level. */
  levelsVector(size: number): Float64Array {
    const x = new Float64Array(size + 1);
    for (let n = 1; n < this.nets.length; n++) if (this.nets[n].digital) x[n] = this.netLevel(n);
    return x;
  }

  // ------------------------------------------------------------ analog side

  /** Bridge stamps (called from stampStep). */
  stamp(s: Stamper): void {
    for (let n = 1; n < this.nets.length; n++) {
      if (!this.nets[n].digital) continue;
      s.matrix(n, n, 1);
      s.rhs(n, this.netLevel(n));
    }
    for (const d of this.drivers) {
      if (this.nets[d.node].digital || d.value === "Z") continue;
      const lv = this.levels(d.el);
      const g = 1 / Math.max(R_MIN, lv.rOut);
      s.conductance(d.node, 0, g);
      s.current(0, d.node, levelOf(d.value, lv) * g);
    }
  }

  /** Add D→A bridge currents to the display's terminal-current block. */
  addBridgeCurrents(x: Float64Array, out: Float64Array): void {
    const base = this.c.nodeCount + 1;
    for (const d of this.drivers) {
      if (this.nets[d.node].digital || d.value === "Z") continue;
      const lv = this.levels(d.el);
      const v = d.node > 0 ? x[d.node] : 0;
      out[base + this.c.termOffsets[d.el] + d.pin] += (v - levelOf(d.value, lv)) / Math.max(R_MIN, lv.rOut);
    }
  }

  /**
   * Fraction (0..1) of the step from xOld to xNew at which the first A→D input
   * changes state; 1 when none does. Used to land a step just past a crossing.
   */
  crossingFraction(xOld: Float64Array, xNew: Float64Array): number {
    let best = 1;
    for (const inp of this.inputs) {
      if (this.nets[inp.node].digital || !inp.known || inp.node === 0) continue;
      const vo = xOld[inp.node];
      const vn = xNew[inp.node];
      if (this.sense(inp, vn) === inp.sensed) continue;
      const lv = this.levels(inp.el);
      const thr = inp.sensed === "1" ? lv.vFall : lv.vRise;
      const frac = vn === vo ? 1 : (thr - vo) / (vn - vo);
      best = Math.min(best, Math.max(0, Math.min(1, frac)));
    }
    return best;
  }

  /** Read A→D inputs from a solution; marks the parts whose inputs changed. */
  senseAll(x: Float64Array): void {
    for (const inp of this.inputs) {
      if (this.nets[inp.node].digital) continue;
      const s = this.sense(inp, inp.node > 0 ? x[inp.node] : 0);
      if (inp.known && s === inp.sensed) continue;
      inp.sensed = s;
      inp.known = true;
      this.marked[inp.el] = 1;
    }
  }

  /**
   * Like senseAll(), but takes in only the first input that changed. A loop
   * of zero-delay parts closed through analog nodes (a two-inverter latch)
   * that flips every part at once in each analog round trip settles when its
   * inputs are taken one at a time, as a real latch resolves on its first edge.
   */
  senseFirst(x: Float64Array): void {
    for (const inp of this.inputs) {
      if (this.nets[inp.node].digital) continue;
      const s = this.sense(inp, inp.node > 0 ? x[inp.node] : 0);
      if (inp.known && s === inp.sensed) continue;
      inp.sensed = s;
      inp.known = true;
      this.marked[inp.el] = 1;
      return;
    }
  }

  // ------------------------------------------------------------ running

  /** Mark a part for evaluation (its props changed). */
  markElement(i: number): void {
    if (this.dm[i]) this.marked[i] = 1;
  }

  markAll(): void {
    this.dm.forEach((d, i) => d && (this.marked[i] = 1));
  }

  /**
   * Evaluate marked parts and process every event due at time t, in delta
   * cycles, until quiet. Returns true if any bridge or digital net changed.
   */
  run(t: number): boolean {
    this.t = t;
    this.analogDirty = false;
    this.levelDirty = false;
    const due = t + timeTol(t);
    for (let delta = 0; ; delta++) {
      if (delta > MAX_DELTAS) throw new DigitalOscillation(this.markedIds(), t);
      this.evaluateMarked();
      let applied = false;
      for (let e = this.queue.peek(); e && e.t <= due; e = this.queue.peek()) {
        this.queue.pop();
        this.apply(e);
        applied = true;
      }
      if (!applied && !this.marked.includes(1)) break;
    }
    return this.analogDirty || this.levelDirty;
  }

  // ------------------------------------------------------------ snapshots

  save(): DigitalSnapshot {
    return {
      values: this.drivers.map((d) => d.value),
      sensed: this.inputs.map((i) => i.sensed),
      known: this.inputs.map((i) => i.known),
      states: this.nets.map((n) => n.state),
      events: this.queue.live().map((e) => [e.t, e.seq, e.driver, e.value]),
      seq: this.seq,
    };
  }

  restore(s: DigitalSnapshot): void {
    this.drivers.forEach((d, k) => {
      d.value = s.values[k];
      d.pending = [];
    });
    this.inputs.forEach((inp, k) => {
      inp.sensed = s.sensed[k];
      inp.known = s.known[k];
    });
    this.nets.forEach((n, k) => (n.state = s.states[k]));
    this.queue.clear();
    for (const [t, seq, driver, value] of s.events) {
      const e: DigitalEvent = { t, seq, driver, value, live: true };
      this.queue.push(e);
      this.drivers[driver].pending.push(e);
    }
    this.seq = s.seq;
    this.marked.fill(0);
  }

  /** Keep driven values and sensed inputs across a topology edit; pending events are re-derived. */
  carryOver(old: DigitalKernel, newToOld: (id: string) => string | undefined): void {
    const oldIndex = old.c.idIndex;
    const map = (el: number) => {
      const id = newToOld(this.c.netlist.elements[el].id);
      return id === undefined ? undefined : oldIndex.get(id);
    };
    for (const d of this.drivers) {
      const oi = map(d.el);
      const k = oi === undefined ? -1 : (old.driverOf[oi]?.[d.pin] ?? -1);
      if (k >= 0) d.value = old.drivers[k].value;
    }
    for (const inp of this.inputs) {
      const oi = map(inp.el);
      const k = oi === undefined ? -1 : (old.inputOf[oi]?.[inp.pin] ?? -1);
      if (k >= 0 && old.inputs[k].known) {
        inp.sensed = old.inputs[k].sensed;
        inp.known = true;
      }
    }
    for (const net of this.nets) net.state = this.resolve(net);
    this.seq = old.seq;
    this.markAll();
  }

  // ------------------------------------------------------------ internals

  private levels(el: number): DigitalLevelsDecl {
    return this.dm[el]!.levels;
  }

  private sense(inp: Input, v: number): Logic {
    const lv = this.levels(inp.el);
    if (!inp.known) return v >= lv.vth ? "1" : "0";
    if (inp.sensed === "1") return v < lv.vFall ? "0" : "1";
    return v > lv.vRise ? "1" : "0";
  }

  private resolve(net: Net): Logic {
    let s: Logic = "Z";
    for (const k of net.drivers) {
      const v = this.drivers[k].value;
      if (v === "Z") continue;
      if (v === "X" || (s !== "Z" && s !== v)) return "X";
      s = v;
    }
    return s;
  }

  /** Voltage of a digital-only net: the level of a driver that produces its state. */
  private netLevel(n: number): number {
    const net = this.nets[n];
    if (net.state === "Z" || net.drivers.length === 0) return 0;
    for (const k of net.drivers) {
      const d = this.drivers[k];
      if (d.value === net.state) return levelOf(net.state, this.levels(d.el));
    }
    return levelOf(net.state, this.levels(this.drivers[net.drivers[0]].el));
  }

  private netLogic(n: number, display: Float64Array): Logic {
    const net = this.nets[n];
    if (!net) return "X";
    if (net.digital) return net.state;
    if (!net.hasDigital) return (display[n] ?? 0) >= ANALOG_LOGIC_THRESHOLD ? "1" : "0";
    if (net.inputs.length > 0) {
      const inp = this.inputs[net.inputs[0]];
      if (inp.known) return inp.sensed;
    }
    const first = net.inputs.length > 0 ? this.inputs[net.inputs[0]].el : this.drivers[net.drivers[0]].el;
    return (n > 0 ? display[n] : 0) >= this.levels(first).vth ? "1" : "0";
  }

  private input(el: number, pin: number): Logic {
    const n = this.c.netlist.elements[el].nodes[pin];
    if (n === undefined) return "Z";
    const net = this.nets[n];
    if (net.digital) return net.state;
    const k = this.inputOf[el][pin];
    if (k >= 0) return this.inputs[k].known ? this.inputs[k].sensed : "X";
    return net.state;
  }

  private schedule(el: number, pin: number, value: Logic, delay: number): void {
    const k = this.driverOf[el]?.[pin] ?? -1;
    if (k < 0) return;
    const d = this.drivers[k];
    const t = this.t + (delay > 0 && Number.isFinite(delay) ? delay : 0);
    while (d.pending.length > 0 && d.pending[d.pending.length - 1].t >= t) d.pending.pop()!.live = false;
    const projected = d.pending.length > 0 ? d.pending[d.pending.length - 1].value : d.value;
    if (projected === value) return;
    const e: DigitalEvent = { t, seq: this.seq++, driver: k, value, live: true };
    d.pending.push(e);
    this.queue.push(e);
  }

  private apply(e: DigitalEvent): void {
    const d = this.drivers[e.driver];
    if (d.pending[0] === e) d.pending.shift();
    else d.pending = d.pending.filter((p) => p !== e);
    if (d.value === e.value) return;
    d.value = e.value;
    if (this.isSource[d.el]) this.marked[d.el] = 1; // clocks re-arm on their own edges
    const net = this.nets[d.node];
    if (!net.digital) {
      this.analogDirty = true;
      return;
    }
    const s = this.resolve(net);
    this.levelDirty = true;
    if (s === net.state) return;
    net.state = s;
    for (const m of net.members) this.marked[m] = 1;
  }

  private evaluateMarked(): void {
    const t = this.t;
    for (let i = 0; i < this.marked.length; i++) {
      if (!this.marked[i]) continue;
      this.marked[i] = 0;
      const ctx: DigitalContext = {
        t,
        input: (pin) => this.input(i, pin),
        schedule: (pin, value, delay) => this.schedule(i, pin, value, delay),
      };
      this.dm[i]?.evaluateDigital(ctx);
    }
  }

  private markedIds(): string[] {
    const out: string[] = [];
    this.marked.forEach((m, i) => m && out.push(this.c.netlist.elements[i].id));
    return out;
  }
}
