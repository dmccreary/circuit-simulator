import type { ElementDescriptor } from "../api";
import { STRETCH, twoTerminals, VIP } from "../shared/descriptorKit";

/**
 * Varactor (varicap) diode, as CircuitJS1's VaractorElm: a diode in parallel
 * with a junction capacitance C = C0 / sqrt(1 - v / Vf) when reverse biased
 * (C0 when forward biased), where Vf is the diode's forward drop.
 */
export const varactorDescriptor: ElementDescriptor = {
  type: "varactor",
  category: "semiconductors",
  aliases: ["varactor", "varicap", "tuning diode", "variable capacitance diode"],
  labelPrefix: "D",
  terminals: twoTerminals("A", "K"),
  stretchable: STRETCH,
  props: [
    { key: "baseCapacitance", unit: "F", range: [1e-15, 1e-6], default: 4e-12, sliderable: true, showOnCanvas: true },
    { key: "forwardVoltage", unit: "V", range: [0.1, 5], default: 0.805904783 },
  ],
  readouts: [...VIP, { key: "capacitance", unit: "F" }],
};
