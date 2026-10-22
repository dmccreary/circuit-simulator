// Descriptors of the chip families (see chips-variants.ts). Pure data.
import type { ElementDescriptor } from "../api";
import { BUS_INPUT_DESCRIPTORS } from "../bus-input/descriptor";
import { INSTRUCTION_DISPLAY_DESCRIPTORS } from "../instruction-display/descriptor";
import { CHIP_VARIANTS } from "./chips-variants";

export const CHIP_DESCRIPTORS: readonly ElementDescriptor[] = [
  ...CHIP_VARIANTS.map((v) => v.descriptor),
  ...BUS_INPUT_DESCRIPTORS,
  ...INSTRUCTION_DISPLAY_DESCRIPTORS,
];
