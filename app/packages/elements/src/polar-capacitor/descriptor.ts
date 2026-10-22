import type { ElementDescriptor } from "../api";
import { STRETCH, twoTerminals, VIP } from "../shared/descriptorKit";

/**
 * Polarized (electrolytic) capacitor, as CircuitJS1's PolarCapacitorElm:
 * terminal 0 is "+". It behaves as a capacitor (with optional series
 * resistance) and is over its rating while reverse biased beyond
 * maxReverseVoltage, where CircuitJS1 stops the simulation.
 */
export const polarCapacitorDescriptor: ElementDescriptor = {
  type: "polar-capacitor",
  category: "passive",
  aliases: ["polarized capacitor", "electrolytic capacitor", "electrolytic", "polar capacitor"],
  labelPrefix: "C",
  terminals: twoTerminals("+", "-"),
  stretchable: STRETCH,
  props: [
    { key: "capacitance", unit: "F", range: [1e-15, 10], default: 10e-6, sliderable: true, standardSeries: true, showOnCanvas: true },
    { key: "initialVoltage", unit: "V", range: [-1e5, 1e5], default: 0 },
    { key: "seriesResistance", unit: "ohm", range: [0, 1e6], default: 0 },
    { key: "maxReverseVoltage", unit: "V", range: [0, 1e5], default: 1 },
  ],
  readouts: [
    ...VIP,
    { key: "capacitance", unit: "F" },
    { key: "charge", unit: "" },
    { key: "energy", unit: "" },
    { key: "reverseOverLimit", unit: "" },
  ],
};
