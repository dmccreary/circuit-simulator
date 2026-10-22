import type { ElementDescriptor } from "../api";
import { STRETCH, twoTerminals, VIP } from "../shared/descriptorKit";

export const dcSourceDescriptor: ElementDescriptor = {
  type: "dc-source",
  category: "sources",
  essentials: true,
  aliases: ["dc voltage source", "voltage source", "power supply", "vdc"],
  labelPrefix: "V",
  terminals: twoTerminals("+", "-"),
  stretchable: STRETCH,
  props: [
    { key: "voltage", unit: "V", range: [-1e5, 1e5], default: 5, sliderable: true, showOnCanvas: true },
    { key: "internalResistance", unit: "ohm", range: [0, 1e6], default: 0 },
  ],
  readouts: VIP,
  traits: { voltageSource: true },
};
