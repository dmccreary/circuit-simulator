import type { PropSpec } from "../api";
import { chipVariant, type ChipVariant } from "../chip-kit/descriptor";
import { bitPins, type ChipSpec } from "../chip-kit/layout";
import { CONVERTER_BITS, rows } from "../dac/descriptor";

/** CircuitJS1 ADCElm: analog input In and reference V+ on the left, digital outputs D down the right. */
export function adcSpec(bits: number): ChipSpec {
  return {
    title: "ADC",
    sizeX: 2,
    sizeY: rows(bits),
    pins: [
      ...bitPins(bits, 0, "E", "D", "analog"),
      { name: "In", side: "W", pos: 0, dir: "analog" },
      { name: "V+", side: "W", pos: rows(bits) - 1, dir: "analog" },
    ],
  };
}

export const adcType = (bits: number) => `adc-${bits}`;

/** ADC outputs: logic high level and output resistance. */
const ADC_PROPS: PropSpec[] = [
  { key: "supply", unit: "V", range: [0.1, 30], default: 5 },
  { key: "outputResistance", unit: "ohm", range: [0, 1e6], default: 25 },
];

export const ADC_VARIANTS: ChipVariant[] = CONVERTER_BITS.map((b) =>
  chipVariant(adcType(b), adcSpec(b), {
    aliases: ["adc", "analog-to-digital converter", "a/d converter", `${b}-bit adc`],
    props: ADC_PROPS,
  }),
);
