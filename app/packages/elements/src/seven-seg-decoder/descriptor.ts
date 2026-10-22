import type { PropSpec } from "../api";
import { chipVariant, DIGITAL_CHIP_PROPS, type ChipVariant } from "../chip-kit/descriptor";
import { bitPins, type ChipPin, type ChipSpec } from "../chip-kit/layout";

/**
 * CircuitJS1 SevenSegDecoderElm (7 segments): segment outputs a..g down the
 * right, the 4-bit input on the left with I3 on top, and with FLAG_ENABLE a
 * blanking input BI̅ below it.
 */
export function decoderSpec(blank: boolean): ChipSpec {
  const pins: ChipPin[] = [];
  for (let i = 0; i < 7; i++) pins.push({ name: String.fromCharCode(97 + i), side: "E", pos: i, dir: "out" });
  pins.push(...bitPins(4, 0, "W", "I", "in", true));
  if (blank) pins.push({ name: "BI", side: "W", pos: 4, dir: "in", bubble: true });
  return { title: "", sizeX: 3, sizeY: 7, pins };
}

export const decoderType = (blank: boolean) => (blank ? "seven-seg-decoder-bi" : "seven-seg-decoder");

/** FLAG_BLANK_F: input 1111 blanks the display instead of showing F. */
const PROPS: PropSpec[] = [{ key: "blankOnF", unit: "", kind: "boolean", default: false }, ...DIGITAL_CHIP_PROPS];

export const DECODER_VARIANTS: ChipVariant[] = [false, true].map((blank) =>
  chipVariant(decoderType(blank), decoderSpec(blank), {
    aliases: ["7-segment decoder", "seven segment decoder", "bcd decoder", "hex decoder"],
    props: PROPS,
  }),
);
