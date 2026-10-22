import type { ElementDescriptor } from "../api";

export const TAPPED_LENGTH = 4;

/**
 * Centre-tapped transformer after CircuitJS1's TappedTransformerElm: the
 * primary from P1 (origin) to P2 four units below, the secondary from S1
 * through the tap to S2 on the far side. `ratio` is total secondary turns
 * over primary turns; each half of the secondary has half of them.
 */
export const tappedTransformerDescriptor: ElementDescriptor = {
  type: "tapped-transformer",
  category: "passive",
  aliases: ["center-tapped transformer", "centre-tapped transformer", "tapped transformer", "transformer"],
  labelPrefix: "T",
  terminals: [
    { name: "P1", at: { x: 0, y: 0 } },
    { name: "P2", at: { x: 0, y: 4 } },
    { name: "S1", at: { x: TAPPED_LENGTH, y: 0 } },
    { name: "tap", at: { x: TAPPED_LENGTH, y: 2 } },
    { name: "S2", at: { x: TAPPED_LENGTH, y: 4 } },
  ],
  stretchable: { min: 2, default: TAPPED_LENGTH, terminals: [2, 3, 4] },
  props: [
    { key: "inductance", unit: "H", range: [1e-9, 1000], default: 4 },
    { key: "ratio", unit: "", range: [1e-4, 1e4], default: 1, showOnCanvas: true },
    { key: "coupling", unit: "", range: [0, 0.99999], default: 0.99 },
  ],
  readouts: [
    { key: "primaryVoltage", unit: "V" },
    { key: "primaryCurrent", unit: "A" },
    { key: "secondaryVoltage", unit: "V" },
    { key: "tapCurrent", unit: "A" },
  ],
};
