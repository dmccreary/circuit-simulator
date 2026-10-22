import type { ElementDescriptor } from "../api";
import { STRETCH, twoTerminals, VIP } from "../shared/descriptorKit";

export const inductorDescriptor: ElementDescriptor = {
  type: "inductor",
  category: "passive",
  essentials: true,
  aliases: ["inductor", "coil", "henry", "choke", "l"],
  hotkey: "l",
  labelPrefix: "L",
  terminals: twoTerminals(),
  stretchable: STRETCH,
  props: [
    {
      key: "inductance",
      unit: "H",
      range: [1e-9, 1000],
      default: 1,
      sliderable: true,
      standardSeries: true,
      showOnCanvas: true,
    },
    { key: "initialCurrent", unit: "A", range: [-1000, 1000], default: 0 },
  ],
  readouts: [
    ...VIP,
    { key: "inductance", unit: "H" },
    { key: "flux", unit: "" },
    { key: "energy", unit: "" },
  ],
};
