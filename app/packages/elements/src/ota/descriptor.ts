import type { ElementDescriptor } from "../api";

/** Input-to-output distance, grid units (112 px, CircuitJS1's usual OTA size). */
export const OTA_LENGTH = 7;

/**
 * Operational transconductance amplifier (LM13700 style) after CircuitJS1's
 * OTAElm, shifted so "+" is at the origin: "-" four units below, the
 * linearizing-diode bias input "D" between them, the bias current input
 * "Iabc" at the top right, and the current output on the far side.
 * The supplies are internal (posSupply / negSupply).
 */
export const otaDescriptor: ElementDescriptor = {
  type: "ota",
  category: "semiconductors",
  aliases: ["ota", "transconductance amplifier", "lm13700", "ca3080"],
  labelPrefix: "U",
  terminals: [
    { name: "+", at: { x: 0, y: 0 } },
    { name: "-", at: { x: 0, y: 4 } },
    { name: "D", at: { x: 0, y: 2 } },
    { name: "Iabc", at: { x: OTA_LENGTH - 1, y: 0 } },
    { name: "out", at: { x: OTA_LENGTH, y: 2 } },
  ],
  stretchable: { min: 6, default: OTA_LENGTH, terminals: [3, 4] },
  props: [
    { key: "posSupply", unit: "V", range: [5, 20], default: 9 },
    { key: "negSupply", unit: "V", range: [-20, -5], default: -9 },
  ],
  readouts: [
    { key: "iabc", unit: "A" },
    { key: "vDiff", unit: "V" },
    { key: "outputCurrent", unit: "A" },
  ],
};
