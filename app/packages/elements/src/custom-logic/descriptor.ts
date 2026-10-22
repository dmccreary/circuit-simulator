import type { PropSpec } from "../api";
import { chipVariant, DIGITAL_CHIP_PROPS, type ChipVariant } from "../chip-kit/descriptor";
import type { ChipPin, ChipSpec } from "../chip-kit/layout";

/** [inputs, outputs] offered: every size up to 4 × 4, plus wide-output decoders. */
export const CUSTOM_LOGIC_SIZES: readonly [number, number][] = [
  ...[1, 2, 3, 4].flatMap((i) => [1, 2, 3, 4].map((o) => [i, o] as [number, number])),
  [3, 8],
  [4, 8],
];

/** CircuitJS1 CustomLogicElm: inputs down the left, outputs down the right. */
export function customLogicSpec(inputs: number, outputs: number, inNames?: string[], outNames?: string[]): ChipSpec {
  const pins: ChipPin[] = [];
  for (let i = 0; i < inputs; i++) pins.push(namedPin(inNames?.[i] ?? String.fromCharCode(65 + i), "W", i, "in"));
  for (let i = 0; i < outputs; i++) pins.push(namedPin(outNames?.[i] ?? String.fromCharCode(65 + inputs + i), "E", i, "out"));
  return { title: "", sizeX: 2, sizeY: Math.max(1, inputs, outputs), pins };
}

/** CustomLogicElm Pin.fixName(): "/X" bars the name, "#X" or "INV:" adds a bubble, "CLK:" or "clk" a clock wedge. */
function namedPin(raw: string, side: "W" | "E", pos: number, dir: "in" | "out"): ChipPin {
  const pin: ChipPin = { name: raw, side, pos, dir };
  if (raw.startsWith("/")) {
    pin.name = raw.slice(1);
    pin.bar = true;
  } else if (raw.startsWith("#")) {
    pin.name = raw.slice(1);
    pin.bubble = true;
  }
  if (pin.name.includes("CLK:")) {
    pin.name = pin.name.split("CLK:").join("");
    pin.clock = true;
  }
  if (pin.name.includes("INV:")) {
    pin.name = pin.name.split("INV:").join("");
    pin.bubble = true;
  }
  if (pin.name.toLowerCase() === "clk") {
    pin.name = "";
    pin.clock = true;
  }
  return pin;
}

export const customLogicType = (inputs: number, outputs: number) => `custom-logic-${inputs}x${outputs}`;

/**
 * The truth table as CircuitJS1 writes it: one rule per line, "inputs=outputs".
 * Left: 0, 1, ? (don't care), + / - (rising / falling edge), letters (copied
 * to the right side; a repeated letter must match). Right: 0, 1, letters, _ (high impedance).
 */
const PROPS: PropSpec[] = [
  { key: "rules", unit: "", kind: "text", default: "" },
  { key: "inputNames", unit: "", kind: "text", default: "" },
  { key: "outputNames", unit: "", kind: "text", default: "" },
  { key: "title", unit: "", kind: "text", default: "" },
  ...DIGITAL_CHIP_PROPS,
];

export const CUSTOM_LOGIC_VARIANTS: ChipVariant[] = CUSTOM_LOGIC_SIZES.map(([i, o]) =>
  chipVariant(customLogicType(i, o), customLogicSpec(i, o), {
    aliases: ["custom logic", "truth table", "programmable logic", "pla"],
    props: PROPS,
  }),
);
