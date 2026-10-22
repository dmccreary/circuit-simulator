import { chipVariant, type ChipVariant } from "../chip-kit/descriptor";
import type { ChipPin, ChipSpec } from "../chip-kit/layout";

/** [columns, rows] offered (CircuitJS1 LEDArrayElm defaults to 8 × 8). */
export const LED_ARRAY_SIZES: readonly [number, number][] = [
  [8, 8],
  [5, 7],
];

/**
 * CircuitJS1 LEDArrayElm: an LED at every column/row crossing, anode on the
 * row (left side), cathode on the column (bottom).
 */
export function ledArraySpec(cols: number, rows: number): ChipSpec {
  const pins: ChipPin[] = [];
  for (let i = 0; i < cols; i++) pins.push({ name: "", side: "S", pos: i, dir: "analog" });
  for (let i = 0; i < rows; i++) pins.push({ name: "", side: "W", pos: i, dir: "analog" });
  return { title: "", sizeX: cols, sizeY: rows, pins };
}

export const ledArrayType = (cols: number, rows: number) => `led-array-${cols}x${rows}`;

export const LED_ARRAY_VARIANTS: ChipVariant[] = LED_ARRAY_SIZES.map(([c, r]) =>
  chipVariant(ledArrayType(c, r), ledArraySpec(c, r), {
    aliases: ["led array", "led matrix", "dot matrix", "matrix display"],
    category: "outputs",
    labelPrefix: "D",
    props: [],
  }),
);
