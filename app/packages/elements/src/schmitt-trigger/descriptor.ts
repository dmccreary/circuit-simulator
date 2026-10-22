import type { ElementDescriptor } from "../api";
import { STRETCH, twoTerminals } from "../shared/descriptorKit";

/**
 * Schmitt trigger buffer after CircuitJS1's SchmittElm / InvertingSchmittElm:
 * input at the origin, output (a voltage source to ground) at the far end.
 * The output switches when the input rises above upperThreshold or falls
 * below lowerThreshold, between lowLevel and highLevel.
 */
function schmitt(inverting: boolean): ElementDescriptor {
  return {
    type: inverting ? "inverting-schmitt-trigger" : "schmitt-trigger",
    category: "logic",
    aliases: inverting ? ["inverting schmitt trigger", "schmitt inverter", "74hc14"] : ["schmitt trigger", "schmitt buffer", "hysteresis"],
    labelPrefix: "U",
    terminals: twoTerminals("in", "out"),
    stretchable: STRETCH,
    props: [
      { key: "lowerThreshold", unit: "V", range: [-1e3, 1e3], default: 1.66 },
      { key: "upperThreshold", unit: "V", range: [-1e3, 1e3], default: 3.33 },
      { key: "highLevel", unit: "V", range: [-1e3, 1e3], default: 5 },
      { key: "lowLevel", unit: "V", range: [-1e3, 1e3], default: 0 },
    ],
    readouts: [
      { key: "vIn", unit: "V" },
      { key: "vOut", unit: "V" },
    ],
  };
}

export const schmittDescriptor = schmitt(false);
export const invertingSchmittDescriptor = schmitt(true);
