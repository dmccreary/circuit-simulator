import { chipVariant, DIGITAL_CHIP_PROPS, type ChipVariant } from "../chip-kit/descriptor";
import { bitPins, type ChipSpec } from "../chip-kit/layout";

/** Resolutions offered for the converters (CircuitJS1 defaults to 4 bits). */
export const CONVERTER_BITS = [4, 8] as const;

export const rows = (bits: number) => Math.max(2, bits);

/** CircuitJS1 DACElm: digital inputs D down the left (MSB on top), analog output O and reference V+ on the right. */
export function dacSpec(bits: number): ChipSpec {
  return {
    title: "DAC",
    sizeX: 2,
    sizeY: rows(bits),
    pins: [
      ...bitPins(bits, 0, "W", "D", "in"),
      { name: "O", side: "E", pos: 0, dir: "analog" },
      { name: "V+", side: "E", pos: rows(bits) - 1, dir: "analog" },
    ],
  };
}

export const dacType = (bits: number) => `dac-${bits}`;

export const DAC_VARIANTS: ChipVariant[] = CONVERTER_BITS.map((b) =>
  chipVariant(dacType(b), dacSpec(b), {
    aliases: ["dac", "digital-to-analog converter", "d/a converter", `${b}-bit dac`],
    props: DIGITAL_CHIP_PROPS,
    readouts: [{ key: "voltage", unit: "V" }],
  }),
);
