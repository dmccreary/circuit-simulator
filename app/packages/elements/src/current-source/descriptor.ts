import type { ElementDescriptor } from "../api";
import { STRETCH, twoTerminals, VIP } from "../shared/descriptorKit";

/** Current flows into terminal "in", through the source, and out of terminal "out". */
export const currentSourceDescriptor: ElementDescriptor = {
  type: "current-source",
  category: "sources",
  aliases: ["current source", "isrc", "constant current"],
  hotkey: "i",
  labelPrefix: "I",
  terminals: twoTerminals("in", "out"),
  stretchable: STRETCH,
  props: [
    { key: "current", unit: "A", range: [-1000, 1000], default: 0.01, sliderable: true, showOnCanvas: true },
    // Small-signal stimulus for the Frequency tab (ANL-08, ANL-16); phase in degrees.
    { key: "acMagnitude", unit: "A", range: [0, 1e5], default: 0 },
    { key: "acPhase", unit: "", range: [-360, 360], default: 0 },
  ],
  readouts: VIP,
  traits: { currentSource: true },
};
