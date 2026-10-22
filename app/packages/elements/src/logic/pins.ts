// Which terminals of each logic part are digital, and in which direction.
// The single source for the models (DigitalPin lists read by the engine's
// kernel) and the resolver (PartTraits.digitalPins, for node kinds).
// TODO(contract): replace with TerminalSpec.digital?: "in" | "out".

export interface DigitalPin {
  pin: number;
  dir: "in" | "out";
}

const pins = (inputs: number[], outputs: number[]): DigitalPin[] => [
  ...inputs.map((pin) => ({ pin, dir: "in" as const })),
  ...outputs.map((pin) => ({ pin, dir: "out" as const })),
];

export const DIGITAL_PINS: Readonly<Record<string, readonly DigitalPin[]>> = {
  "logic-input": pins([], [0]),
  "logic-output": pins([0], []),
  clock: pins([], [0]),
  "and-gate": pins([0, 1], [2]),
  "or-gate": pins([0, 1], [2]),
  "nand-gate": pins([0, 1], [2]),
  "nor-gate": pins([0, 1], [2]),
  "xor-gate": pins([0, 1], [2]),
  "not-gate": pins([0], [1]),
  // D, CLK, Q, Q̄, S, R
  "d-flip-flop": pins([0, 1, 4, 5], [2, 3]),
  // J, CLK, K, Q, Q̄
  "jk-flip-flop": pins([0, 1, 2], [3, 4]),
};

/** Digital terminal indexes of a part type, or undefined for analog parts. */
export function digitalPinsOf(type: string): number[] | undefined {
  const p = Object.prototype.hasOwnProperty.call(DIGITAL_PINS, type) ? DIGITAL_PINS[type] : undefined;
  return p ? p.map((d) => d.pin).sort((a, b) => a - b) : undefined;
}
