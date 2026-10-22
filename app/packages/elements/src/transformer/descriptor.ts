import type { ElementDescriptor } from "../api";

export const TRANSFORMER_LENGTH = 5; // 80 px, as in the Falstad examples
export const TRANSFORMER_HEIGHT = 2;

/**
 * Primary winding on the left (P+ above P-), secondary on the right (S+ above
 * S-), dotted ends on top: the CircuitJS1 TransformerElm layout. `ratio` is
 * secondary turns over primary turns, so L2 = L1·ratio².
 */
export const transformerDescriptor: ElementDescriptor = {
  type: "transformer",
  category: "passive",
  aliases: ["transformer", "coupled inductors", "mutual inductance", "step-down", "step-up"],
  labelPrefix: "T",
  terminals: [
    { name: "P+", at: { x: 0, y: 0 } },
    { name: "P-", at: { x: 0, y: TRANSFORMER_HEIGHT } },
    { name: "S+", at: { x: TRANSFORMER_LENGTH, y: 0 } },
    { name: "S-", at: { x: TRANSFORMER_LENGTH, y: TRANSFORMER_HEIGHT } },
  ],
  props: [
    { key: "inductance", unit: "H", range: [1e-9, 1000], default: 4 },
    { key: "ratio", unit: "", range: [1e-4, 1e4], default: 1, sliderable: true, showOnCanvas: true },
    { key: "coupling", unit: "", range: [0, 1], default: 0.999 },
    { key: "reversePolarity", unit: "", kind: "boolean", default: false },
  ],
  readouts: [
    { key: "primaryVoltage", unit: "V" },
    { key: "primaryCurrent", unit: "A" },
    { key: "secondaryVoltage", unit: "V" },
    { key: "secondaryCurrent", unit: "A" },
    { key: "ratio", unit: "" },
    { key: "powerIn", unit: "W" },
    { key: "powerOut", unit: "W" },
  ],
};
