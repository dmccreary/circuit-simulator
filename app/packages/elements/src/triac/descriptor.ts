import type { ElementDescriptor } from "../api";
import { THYRISTOR_STRETCH, thyristorTerminals } from "../scr/descriptor";

/**
 * Triac, as CircuitJS1's TriacElm: back-to-back diodes from MT2 to an internal
 * node, a switched resistance from there to MT1, and gateResistance from gate
 * to MT1. Turns on when |gate current| > triggerCurrent and off when the main
 * current falls below holdingCurrent.
 */
export const triacDescriptor: ElementDescriptor = {
  type: "triac",
  category: "semiconductors",
  aliases: ["triac", "bidirectional thyristor", "ac switch"],
  labelPrefix: "D",
  terminals: thyristorTerminals("MT2", "MT1"),
  stretchable: THYRISTOR_STRETCH,
  props: [
    { key: "triggerCurrent", unit: "A", range: [1e-6, 10], default: 0.01 },
    { key: "holdingCurrent", unit: "A", range: [1e-6, 10], default: 0.0082 },
    { key: "gateResistance", unit: "ohm", range: [1e-3, 1e9], default: 100 },
    { key: "on", unit: "", kind: "boolean", default: false },
  ],
  readouts: [
    { key: "voltage", unit: "V" },
    { key: "current", unit: "A" },
    { key: "power", unit: "W" },
    { key: "gateCurrent", unit: "A" },
    { key: "on", unit: "" },
  ],
};
