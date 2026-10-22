import type { ElementDescriptor } from "../api";
import { STRETCH, twoTerminals, VIP } from "../shared/descriptorKit";

/** A diode that also conducts in reverse once the voltage reaches zenerVoltage. state: 0 reverse, 1 forward, 2 breakdown. */
export const zenerDiodeDescriptor: ElementDescriptor = {
  type: "zener-diode",
  category: "semiconductors",
  aliases: ["zener", "zener diode", "voltage reference", "1n4733", "1n750"],
  labelPrefix: "D",
  terminals: twoTerminals("A", "K"),
  stretchable: STRETCH,
  props: [
    { key: "zenerVoltage", unit: "V", range: [0.5, 1000], default: 5.6, showOnCanvas: true },
    { key: "saturationCurrent", unit: "A", range: [1e-20, 1e-3], default: 1e-14 },
    { key: "emissionCoefficient", unit: "", range: [0.5, 4], default: 1 },
  ],
  readouts: [...VIP, { key: "state", unit: "" }],
};
