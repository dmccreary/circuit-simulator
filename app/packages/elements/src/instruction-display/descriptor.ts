import type { ElementDescriptor } from "../api";
import { busTerminals } from "../bus-input/descriptor";

/** Bus widths offered (CircuitJS1 InstructionDisplayElm defaults to 4). */
export const INSTRUCTION_DISPLAY_WIDTHS = [4, 5, 8] as const;

export const instructionDisplayType = (w: number) => `instruction-display-${w}`;

/**
 * CircuitJS1 InstructionDisplayElm: shows the text its lookup table gives for
 * the bus value. Lines "key=text", the key a number or a range "lo-hi"
 * (0x / 0b prefixes allowed); "{expr}" in the text is evaluated with a = value.
 */
export const INSTRUCTION_DISPLAY_DESCRIPTORS: ElementDescriptor[] = INSTRUCTION_DISPLAY_WIDTHS.map((w) => ({
  type: instructionDisplayType(w),
  category: "outputs",
  aliases: ["instruction display", "lookup display", "bus display", "disassembler"],
  labelPrefix: "DS",
  terminals: busTerminals(w, "I"),
  props: [
    { key: "lookup", unit: "", kind: "text", default: "" },
    { key: "threshold", unit: "V", range: [-100, 100], default: 2.5 },
  ],
  readouts: [],
}));
