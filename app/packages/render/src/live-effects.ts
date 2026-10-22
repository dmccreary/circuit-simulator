// Per-part live quantities for the live layer and the realism badges
// (rendering.md §4): voltage across, current, power, glow brightness with the
// lamp filament's lag (ANI-17), and a mirror of the heating model behind the
// ratings warning badge (RLM-05). Everything is computed from the display
// state each frame, so it needs nothing from the worker beyond the frame.

import type { CircuitDocument, CompiledCircuit } from "@cs/model";
import { terminalCurrentOffsets } from "@cs/model";
import {
  failThreshold,
  failedMode,
  heatStep,
  measure,
  perceptualBrightness,
  ratingStress,
  ratingValue,
  ratingsFor,
  type RatingSpec,
} from "@cs/elements";

export interface PartLiveValues {
  /** V(terminal 0) − V(terminal 1). */
  voltage: number;
  /** Current into terminal 0. */
  current: number;
  /** Absorbed power, Σ V·I over terminals (negative when delivering). */
  power: number;
  /** Glow brightness 0..1 on a perceptual scale (lamps, LEDs). */
  brightness: number;
  /** Heat as a fraction of the failure point, 0..1+ (rated parts with ratings on). */
  heat: number;
  /** Largest stress ratio (above 1: over the continuous rating). */
  stress: number;
  /** The rating under most stress, with its measured value. */
  worst?: { spec: RatingSpec; value: number; rating: number };
  failed?: "open" | "short";
}

interface Entry {
  id: string;
  type: string;
  props: Record<string, unknown>;
  nodes: number[];
  /** Display index of terminal 0's current. */
  ibase: number;
  specs: readonly RatingSpec[];
  theta: Float64Array;
  /** Lamp filament θ (normalized to rated power). */
  filament: number;
  values: PartLiveValues;
  volts: Float64Array;
  currents: Float64Array;
}

const LAMP_TAU = 0.1; // filament heating time constant, simulated seconds

export class LiveEffects {
  private entries = new Map<string, Entry>();
  private lastSim: number | undefined;
  private lastReal: number | undefined;
  /** Largest |power| among parts at the last update (power view scale). */
  maxPower = 0;
  /** Largest |terminal voltage| at the last update: the charge-mark scale (ANI-18). */
  maxVoltage = 0;
  /** Mirror the ratings heating (the circuit's realistic ratings setting). */
  ratingsOn = false;

  build(doc: CircuitDocument, compiled: CompiledCircuit | undefined): void {
    const old = this.entries;
    this.entries = new Map();
    this.ratingsOn = !!doc.settings?.realisticRatings;
    if (!compiled) return;
    const net = compiled.netlist;
    const offs = terminalCurrentOffsets(net);
    const base = net.nodeCount + 1;
    net.elements.forEach((el, i) => {
      const part = doc.parts[el.id];
      if (!part) return;
      const specs = ratingsFor(part.type);
      const prev = old.get(el.id);
      const e: Entry = {
        id: el.id,
        type: part.type,
        props: part.props,
        nodes: el.nodes.slice(),
        ibase: base + offs[i],
        specs,
        theta: prev && prev.specs.length === specs.length ? prev.theta : new Float64Array(specs.length),
        filament: prev?.filament ?? 0,
        values: { voltage: 0, current: 0, power: 0, brightness: 0, heat: 0, stress: 0 },
        volts: new Float64Array(el.nodes.length),
        currents: new Float64Array(el.nodes.length),
      };
      if (failedMode(part.props)) e.theta.fill(0);
      this.entries.set(el.id, e);
    });
  }

  /** Forget heating and filament state (Reset). */
  reset(): void {
    for (const e of this.entries.values()) {
      e.theta.fill(0);
      e.filament = 0;
      e.values.brightness = 0;
      e.values.heat = 0;
    }
    this.lastSim = undefined;
  }

  /**
   * A new display state. `simTime` advances the heating in simulated time;
   * without it, real time is used. A jump back in time (scrubbing, reset)
   * restarts the filters at their steady value.
   */
  update(display: ArrayLike<number> | undefined, now: number, simTime?: number): void {
    let dt = 0;
    let settle = false;
    if (simTime !== undefined) {
      if (this.lastSim === undefined || simTime < this.lastSim) settle = true;
      else dt = simTime - this.lastSim;
      this.lastSim = simTime;
    } else {
      dt = this.lastReal === undefined ? 0 : Math.max(0, now - this.lastReal);
      this.lastReal = now;
    }
    let pmax = 0;
    let vmax = 0;
    for (const e of this.entries.values()) {
      const v = e.values;
      if (!display) {
        v.voltage = v.current = v.power = v.brightness = v.stress = 0;
        continue;
      }
      let p = 0;
      for (let k = 0; k < e.nodes.length; k++) {
        const n = e.nodes[k];
        e.volts[k] = n > 0 ? (display[n] ?? 0) : 0;
        e.currents[k] = display[e.ibase + k] ?? 0;
        p += e.volts[k] * e.currents[k];
      }
      v.voltage = e.volts[0] - (e.volts[1] ?? 0);
      v.current = e.currents[0];
      v.power = Number.isFinite(p) ? p : 0;
      v.failed = failedMode(e.props as Record<string, string>);
      pmax = Math.max(pmax, Math.abs(v.power));
      for (let k = 0; k < e.volts.length; k++) vmax = Math.max(vmax, Math.abs(e.volts[k]));
      this.glow(e, dt, settle);
      this.heat(e, dt, settle);
    }
    this.maxPower = pmax;
    this.maxVoltage = vmax;
  }

  private glow(e: Entry, dt: number, settle: boolean): void {
    const v = e.values;
    if (v.failed) {
      v.brightness = 0;
      e.filament = 0;
      return;
    }
    if (e.type === "lamp") {
      const rated = num(e.props.ratedPower, 3);
      const s = Math.abs(v.power) / rated;
      e.filament = settle ? s : heatStep(e.filament, s, dt, LAMP_TAU);
      v.brightness = perceptualBrightness(e.filament);
    } else if (e.type === "led") {
      const full = num(e.props.fullBrightnessCurrent, 0.02);
      v.brightness = perceptualBrightness(Math.max(0, v.current) / full);
    }
  }

  private heat(e: Entry, dt: number, settle: boolean): void {
    const v = e.values;
    v.heat = 0;
    v.stress = 0;
    v.worst = undefined;
    if (!e.specs.length || v.failed) return;
    const props = e.props as Record<string, number | string | boolean>;
    // Stress is always known (RLM-08 hints in ideal mode); heat only accumulates with ratings on.
    e.specs.forEach((spec, i) => {
      const s = ratingStress(spec, props, e.volts, e.currents);
      e.theta[i] = !this.ratingsOn || settle ? 0 : heatStep(e.theta[i], s, dt, spec.tau);
      const frac = e.theta[i] / failThreshold(spec);
      if (s > v.stress || (!v.worst && s > 0)) {
        v.stress = s;
        v.worst = { spec, value: measure(spec, e.volts, e.currents), rating: ratingValue(spec, props) };
      }
      v.heat = Math.max(v.heat, frac);
    });
  }

  /** Terminal voltages of a part at the last update (shared buffer; do not keep). */
  volts(partId: string): Float64Array | undefined {
    return this.entries.get(partId)?.volts;
  }

  get(partId: string): PartLiveValues | undefined {
    return this.entries.get(partId)?.values;
  }

  /** One live value by readout key, for LiveReadouts.get(). */
  readout(partId: string, key: string): number | undefined {
    const v = this.entries.get(partId)?.values;
    if (!v) return undefined;
    switch (key) {
      case "voltage":
        return v.voltage;
      case "current":
        return v.current;
      case "power":
        return v.power;
      case "brightness":
        return v.brightness;
      case "heat":
        return v.heat;
      case "chargeLevel":
        // Signed: positive when terminal 0's plate holds the positive charge.
        return this.maxVoltage > 0 ? v.voltage / this.maxVoltage : 0;
      default:
        return undefined;
    }
  }

  parts(): IterableIterator<[string, PartLiveValues]> {
    const it = this.entries.entries();
    return (function* () {
      for (const [id, e] of it) yield [id, e.values] as [string, PartLiveValues];
    })();
  }
}

const num = (v: unknown, fallback: number): number => (typeof v === "number" && v > 0 ? v : fallback);
