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
    { key: "internalResistance", unit: "ohm", range: [0, 1e6], default: 0, realisticDefault: 0.05 },
    // Small-signal stimulus for the Frequency tab (ANL-08, ANL-16); phase in degrees.
    { key: "acMagnitude", unit: "V", range: [0, 1e5], default: 0 },
    { key: "acPhase", unit: "", range: [-360, 360], default: 0 },
  ],
  readouts: VIP,
  traits: { voltageSource: true },
};
