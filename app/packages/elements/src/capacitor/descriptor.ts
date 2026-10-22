import type { ElementDescriptor } from "../api";
import { STRETCH, twoTerminals, VIP } from "../shared/descriptorKit";

export const capacitorDescriptor: ElementDescriptor = {
  type: "capacitor",
  category: "passive",
  essentials: true,
  aliases: ["capacitor", "cap", "farad", "c"],
  hotkey: "c",
  labelPrefix: "C",
  terminals: twoTerminals(),
  stretchable: STRETCH,
  props: [
    {
      key: "capacitance",
      unit: "F",
      range: [1e-15, 10],
      default: 10e-6,
      sliderable: true,
      standardSeries: true,
      showOnCanvas: true,
    },
    { key: "initialVoltage", unit: "V", range: [-1e5, 1e5], default: 0 },
  ],
  readouts: [
    ...VIP,
    { key: "capacitance", unit: "F" },
    { key: "charge", unit: "" },
    { key: "energy", unit: "" },
  ],
};
