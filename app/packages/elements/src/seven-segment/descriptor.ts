import type { ElementDescriptor } from "../api";

/** Segment terminals a..g, placed like CircuitJS1's SevenSegElm with logic inputs: a-d down the left, e-g along the bottom. */
export const SEGMENT_PINS = [
  { x: 0, y: 0 },
  { x: 0, y: 2 },
  { x: 0, y: 4 },
  { x: 0, y: 6 },
  { x: 4, y: 8 },
  { x: 6, y: 8 },
  { x: 8, y: 8 },
] as const;

/** Seven-segment display driven by logic levels: a segment lights while its input is above `threshold`. */
export const sevenSegmentDescriptor: ElementDescriptor = {
  type: "seven-segment",
  category: "outputs",
  aliases: ["seven segment", "7-segment", "7 segment display", "digit display", "led display"],
  labelPrefix: "DS",
  terminals: SEGMENT_PINS.map((at, i) => ({ name: String.fromCharCode(97 + i), at: { ...at } })),
  props: [{ key: "threshold", unit: "V", range: [-100, 100], default: 2.5 }],
  readouts: [],
};
