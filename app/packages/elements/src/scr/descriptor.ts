import type { ElementDescriptor, TerminalSpec } from "../api";

/** Default anode-cathode length; the gate sits two units off the axis, two units past the middle. */
export const THYRISTOR_LENGTH = 6;
export const THYRISTOR_STRETCH = { min: 4, default: THYRISTOR_LENGTH, terminals: [1], midTerminals: [2] };

/** Two-terminal axis plus a gate at (L/2 + 2, 2), where CircuitJS1's SCRElm and TriacElm put it. */
export function thyristorTerminals(t0: string, t1: string): TerminalSpec[] {
  return [
    { name: t0, at: { x: 0, y: 0 } },
    { name: t1, at: { x: THYRISTOR_LENGTH, y: 0 } },
    { name: "G", at: { x: THYRISTOR_LENGTH / 2 + 2, y: 2 } },
  ];
}

/**
 * Silicon-controlled rectifier, as CircuitJS1's SCRElm: a diode from an
 * internal node to the cathode, a switched resistance from the anode to that
 * node, and gateResistance from gate to cathode. It latches on when
 * ig/triggerCurrent + ia/holdingCurrent > 1.
 */
export const scrDescriptor: ElementDescriptor = {
  type: "scr",
  category: "semiconductors",
  aliases: ["scr", "thyristor", "silicon controlled rectifier"],
  labelPrefix: "D",
  terminals: thyristorTerminals("A", "K"),
  stretchable: THYRISTOR_STRETCH,
  props: [
    { key: "triggerCurrent", unit: "A", range: [1e-6, 10], default: 0.01 },
    { key: "holdingCurrent", unit: "A", range: [1e-6, 10], default: 0.0082 },
    { key: "gateResistance", unit: "ohm", range: [1e-3, 1e9], default: 50 },
  ],
  readouts: [
    { key: "voltage", unit: "V" },
    { key: "current", unit: "A" },
    { key: "power", unit: "W" },
    { key: "gateCurrent", unit: "A" },
    { key: "on", unit: "" },
  ],
};
