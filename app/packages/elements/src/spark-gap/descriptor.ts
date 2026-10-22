import type { ElementDescriptor } from "../api";
import { STRETCH, twoTerminals, VIP } from "../shared/descriptorKit";

/**
 * Spark gap, as CircuitJS1's SparkGapElm: offResistance until the voltage
 * across it exceeds breakdownVoltage, then onResistance until the current
 * falls below holdingCurrent.
 */
export const sparkGapDescriptor: ElementDescriptor = {
  type: "spark-gap",
  category: "switches",
  aliases: ["spark gap", "gas discharge tube", "surge arrester", "arc gap"],
  labelPrefix: "SG",
  terminals: twoTerminals(),
  stretchable: STRETCH,
  props: [
    { key: "breakdownVoltage", unit: "V", range: [1, 1e7], default: 1000, showOnCanvas: true },
    { key: "onResistance", unit: "ohm", range: [1e-6, 1e9], default: 1000 },
    { key: "offResistance", unit: "ohm", range: [1, 1e15], default: 1e9 },
    { key: "holdingCurrent", unit: "A", range: [0, 100], default: 0.001 },
  ],
  readouts: [...VIP, { key: "conducting", unit: "" }],
};
