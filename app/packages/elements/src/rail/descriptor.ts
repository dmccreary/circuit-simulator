import type { ElementDescriptor } from "../api";

export const RAIL_WAVEFORMS = ["dc", "ac", "square", "triangle", "sawtooth", "pulse", "noise", "sweep"] as const;
export type RailWaveform = (typeof RAIL_WAVEFORMS)[number];

/** Default lead length from the terminal to the rail's value label, grid units. */
export const RAIL_LENGTH = 2;

/**
 * A voltage referenced to ground on a single terminal, as CircuitJS1's RailElm
 * (and VarRailElm, SweepElm) draws it: the terminal, a lead, and the value.
 * v(t) follows VoltageElm.getVoltage(): `voltage` is the peak (or the DC level),
 * `offset` the bias. "noise" holds a pseudo-random level in ±voltage for
 * 1/(100·frequency) at a time. "sweep" glides from `frequency` to `maxFrequency` over
 * `sweepTime` (linear, or logarithmic with `logSweep`), then starts again.
 */
export const railDescriptor: ElementDescriptor = {
  type: "rail",
  category: "sources",
  aliases: ["rail", "voltage rail", "supply rail", "vcc", "vdd", "sweep", "frequency sweep"],
  labelPrefix: "V",
  terminals: [{ name: "+", at: { x: 0, y: 0 } }],
  stretchable: { min: 1, default: RAIL_LENGTH, terminals: [] },
  props: [
    { key: "waveform", unit: "", kind: "enum", options: [...RAIL_WAVEFORMS], default: "dc" },
    { key: "voltage", unit: "V", range: [-1e5, 1e5], default: 5, sliderable: true, showOnCanvas: true },
    { key: "offset", unit: "V", range: [-1e5, 1e5], default: 0, sliderable: true },
    { key: "frequency", unit: "Hz", range: [1e-3, 1e10], default: 40, sliderable: true },
    { key: "phase", unit: "", range: [-360, 360], default: 0 },
    { key: "dutyCycle", unit: "%", range: [0, 100], default: 50 },
    { key: "maxFrequency", unit: "Hz", range: [1e-3, 1e10], default: 4000 },
    { key: "sweepTime", unit: "s", range: [1e-9, 1e4], default: 0.5 },
    { key: "logSweep", unit: "", kind: "boolean", default: true },
  ],
  readouts: [
    { key: "voltage", unit: "V" },
    { key: "current", unit: "A" },
    { key: "power", unit: "W" },
  ],
  traits: { voltageSource: true },
};
