import type { ElementDescriptor } from "../api";
import { STRETCH, twoTerminals, VIP } from "../shared/descriptorKit";

export const resistorDescriptor: ElementDescriptor = {
  type: "resistor",
  category: "passive",
  essentials: true,
  aliases: ["resistor", "res", "ohm", "r"],
  hotkey: "r",
  labelPrefix: "R",
  terminals: twoTerminals(),
  stretchable: STRETCH,
  props: [
    {
      key: "resistance",
      unit: "ohm",
      range: [1e-6, 1e12],
      default: 1000,
      sliderable: true,
      standardSeries: true,
      showOnCanvas: true,
    },
  ],
  readouts: [...VIP, { key: "resistance", unit: "ohm" }],
};
