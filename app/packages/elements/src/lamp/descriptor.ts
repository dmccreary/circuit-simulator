import type { ElementDescriptor } from "../api";
import { STRETCH, twoTerminals, VIP } from "../shared/descriptorKit";

export const lampDescriptor: ElementDescriptor = {
  type: "lamp",
  category: "outputs",
  essentials: true,
  aliases: ["lamp", "bulb", "light bulb", "globe"],
  labelPrefix: "L",
  terminals: twoTerminals(),
  stretchable: STRETCH,
  props: [
    { key: "ratedVoltage", unit: "V", range: [0.1, 1e4], default: 6, showOnCanvas: true },
    { key: "ratedPower", unit: "W", range: [1e-3, 1e5], default: 3, showOnCanvas: true },
  ],
  readouts: [...VIP, { key: "resistance", unit: "ohm" }, { key: "brightness", unit: "" }],
};
