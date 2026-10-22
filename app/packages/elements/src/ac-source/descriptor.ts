import type { ElementDescriptor } from "../api";
import { STRETCH, twoTerminals, VIP } from "../shared/descriptorKit";

export const acSourceDescriptor: ElementDescriptor = {
  type: "ac-source",
  category: "sources",
  essentials: true,
  aliases: ["ac voltage source", "ac", "sine", "mains", "vac"],
  hotkey: "a",
  labelPrefix: "V",
  terminals: twoTerminals("+", "-"),
  stretchable: STRETCH,
  props: [
    { key: "amplitude", unit: "V", range: [-1e5, 1e5], default: 5, sliderable: true, showOnCanvas: true },
    { key: "frequency", unit: "Hz", range: [1e-3, 1e10], default: 60, sliderable: true, showOnCanvas: true },
    { key: "offset", unit: "V", range: [-1e5, 1e5], default: 0, sliderable: true },
    // Degrees; Unit has no degree symbol.
    { key: "phase", unit: "", range: [-360, 360], default: 0, sliderable: true },
    // Small-signal stimulus for the Frequency tab (ANL-08, ANL-16); phase in degrees.
    { key: "acMagnitude", unit: "V", range: [0, 1e5], default: 0 },
    { key: "acPhase", unit: "", range: [-360, 360], default: 0 },
  ],
  readouts: [...VIP, { key: "frequency", unit: "Hz" }, { key: "peak", unit: "V" }, { key: "rms", unit: "V" }],
  traits: { voltageSource: true },
};
