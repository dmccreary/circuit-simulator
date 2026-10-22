import type { ElementDescriptor } from "../api";
import { STRETCH, twoTerminals, VIP } from "../shared/descriptorKit";

/**
 * Diac, as CircuitJS1's DiacElm: two paths of a switched resistance and a
 * diode, one per direction. Conducts (onResistance) once |v| exceeds
 * breakdownVoltage, until |i| falls below holdingCurrent.
 */
export const diacDescriptor: ElementDescriptor = {
  type: "diac",
  category: "semiconductors",
  aliases: ["diac", "trigger diode", "bidirectional trigger diode"],
  labelPrefix: "D",
  terminals: twoTerminals(),
  stretchable: STRETCH,
  props: [
    { key: "breakdownVoltage", unit: "V", range: [0.1, 1e4], default: 30, showOnCanvas: true },
    { key: "onResistance", unit: "ohm", range: [1e-6, 1e9], default: 500 },
    { key: "offResistance", unit: "ohm", range: [1, 1e15], default: 1e8 },
    { key: "holdingCurrent", unit: "A", range: [0, 10], default: 0.01 },
  ],
  readouts: [...VIP, { key: "conducting", unit: "" }],
};
