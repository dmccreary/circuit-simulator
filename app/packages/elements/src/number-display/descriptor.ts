import type { ElementDescriptor } from "../api";

export const DISPLAY_MAX_BITS = 16;
export const DISPLAY_MODES = ["decimal", "hex", "octal"] as const;

/**
 * Shows the binary number on its inputs, like CircuitJS1's DecimalDisplayElm:
 * inputs two units apart down the left, most significant bit on top. Only the
 * first `bits` terminals are used.
 */
export const numberDisplayDescriptor: ElementDescriptor = {
  type: "number-display",
  category: "outputs",
  aliases: ["number display", "decimal display", "hex display", "binary display", "readout"],
  labelPrefix: "DS",
  terminals: Array.from({ length: DISPLAY_MAX_BITS }, (_, i) => ({ name: `I${i}`, at: { x: 0, y: 2 * i } })),
  props: [
    { key: "bits", unit: "", range: [1, DISPLAY_MAX_BITS], default: 4 },
    { key: "mode", unit: "", kind: "enum", options: [...DISPLAY_MODES], default: "decimal" },
    { key: "threshold", unit: "V", range: [-100, 100], default: 2.5 },
  ],
  readouts: [],
};
