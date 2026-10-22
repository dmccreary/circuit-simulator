import type { ElementDescriptor } from "../api";
import { STRETCH, twoTerminals, VIP } from "../shared/descriptorKit";

export const batteryDescriptor: ElementDescriptor = {
  type: "battery",
  category: "sources",
  essentials: true,
  aliases: ["battery", "cell", "dc", "bat"],
  hotkey: "b",
  labelPrefix: "V",
  terminals: twoTerminals("+", "-"),
  stretchable: STRETCH,
  props: [
    { key: "voltage", unit: "V", range: [-1e5, 1e5], default: 9, sliderable: true, showOnCanvas: true },
    { key: "internalResistance", unit: "ohm", range: [0, 1e6], default: 0, realisticDefault: 0.5 },
  ],
  readouts: VIP,
  traits: { voltageSource: true },
};
