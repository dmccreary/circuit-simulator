import type { ElementDescriptor } from "../api";
import { STRETCH, twoTerminals, VIP } from "../shared/descriptorKit";

export const diodeDescriptor: ElementDescriptor = {
  type: "diode",
  category: "semiconductors",
  essentials: true,
  aliases: ["diode", "rectifier", "1n4148", "1n4004"],
  hotkey: "d",
  labelPrefix: "D",
  terminals: twoTerminals("A", "K"),
  stretchable: STRETCH,
  props: [
    { key: "saturationCurrent", unit: "A", range: [1e-20, 1e-3], default: 1e-14 },
    { key: "emissionCoefficient", unit: "", range: [0.5, 4], default: 1 },
  ],
  readouts: [...VIP, { key: "forward", unit: "" }],
};
