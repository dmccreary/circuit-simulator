// Digital pins of the chip families, spread into the logic pin table (logic/pins.ts).
// Must stay free of models and views: logic/pins.ts is imported by both halves.
import { chipDigitalPins } from "../chip-kit/layout";
import { BUS_INPUT_DESCRIPTORS } from "../bus-input/descriptor";
import { CHIP_VARIANTS } from "./chips-variants";

export const CHIP_DIGITAL_PINS: Readonly<Record<string, readonly { pin: number; dir: "in" | "out" }[]>> = Object.fromEntries([
  ...CHIP_VARIANTS.filter((v) => v.spec.pins.some((p) => p.dir !== "analog")).map((v) => [v.type, chipDigitalPins(v.spec)]),
  // Bus inputs: every terminal an output.
  ...BUS_INPUT_DESCRIPTORS.map((d) => [d.type, d.terminals.map((_, pin) => ({ pin, dir: "out" as const }))]),
]);
