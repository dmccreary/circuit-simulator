import { chipVariant, DIGITAL_CHIP_PROPS, type ChipVariant } from "../chip-kit/descriptor";
import { bitPins, busPins, type ChipSpec } from "../chip-kit/layout";

/** Widths offered: CircuitJS1 FullAdderElm is 1 bit unless FLAG_BITS gives a width (4 by default). */
export const ADDER_BITS = [1, 4] as const;

/** CircuitJS1 FullAdderElm: A and B down the left, then Cin; carry out C on top of the sums S on the right. */
export function adderSpec(bits: number, bus = false): ChipSpec {
  const rows = bus ? 1 : bits;
// Bus form: A and B in 2 × 2 blocks inside the left edge, S in a column inside the right edge.
const block = (x: number, y: number) => (z: number) => ({ x: x + (z % 2), y: y + Math.floor(z / 2) });
  return {
    title: "Adder",
    sizeX: 2,
    sizeY: 2 * rows + 1,
    pins: [
      ...(bus ? busPins(bits, 0, "W", "A", "in", false, block(2, 0)) : bitPins(bits, 0, "W", "A", "in")),
      ...(bus ? busPins(bits, 1, "W", "B", "in", false, block(2, 2)) : bitPins(bits, bits, "W", "B", "in")),
      ...(bus ? busPins(bits, 2, "E", "S", "out", false, (z) => ({ x: 4, y: 1 + z })) : bitPins(bits, 2, "E", "S", "out")),
      { name: "Cin", side: "W", pos: 2 * rows, dir: "in" },
      { name: "C", side: "E", pos: 0, dir: "out" },
    ],
  };
}

export const adderType = (bits: number, bus = false) => (bits === 1 ? "full-adder" : `full-adder-${bits}${bus ? "-bus" : ""}`);
export const ADDER_BUS_BITS = [4] as const;

export const ADDER_VARIANTS: ChipVariant[] = ADDER_BITS.map((b) =>
  chipVariant(adderType(b), adderSpec(b), {
    aliases: ["full adder", "adder", "binary adder", `${b}-bit adder`],
    props: DIGITAL_CHIP_PROPS,
  }),
).concat(
  ADDER_BUS_BITS.map((b) =>
    chipVariant(adderType(b, true), adderSpec(b, true), {
      aliases: ["full adder", "adder", `${b}-bit adder (bus)`],
      props: DIGITAL_CHIP_PROPS,
    }),
  ),
);
