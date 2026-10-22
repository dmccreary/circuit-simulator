import type { ElementDescriptor } from "../../api";
import { LEVEL_PROPS, TIMING_PROPS } from "../levels";

const PROPS = [...TIMING_PROPS, ...LEVEL_PROPS];
const READOUTS = [
  { key: "output", unit: "" as const },
  { key: "voltage", unit: "V" as const },
];

function gate(type: string, aliases: string[]): ElementDescriptor {
  return {
    type,
    category: "logic",
    aliases,
    labelPrefix: "U",
    terminals: [
      { name: "A", at: { x: 0, y: 0 } },
      { name: "B", at: { x: 0, y: 2 } },
      { name: "Y", at: { x: 4, y: 1 } },
    ],
    props: PROPS,
    readouts: READOUTS,
  };
}

export const andGateDescriptor = gate("and-gate", ["and", "and gate"]);
export const orGateDescriptor = gate("or-gate", ["or", "or gate"]);
export const nandGateDescriptor = gate("nand-gate", ["nand", "nand gate"]);
export const norGateDescriptor = gate("nor-gate", ["nor", "nor gate"]);
export const xorGateDescriptor = gate("xor-gate", ["xor", "xor gate", "exclusive or"]);

export const notGateDescriptor: ElementDescriptor = {
  type: "not-gate",
  category: "logic",
  aliases: ["not", "inverter", "not gate"],
  labelPrefix: "U",
  terminals: [
    { name: "A", at: { x: 0, y: 0 } },
    { name: "Y", at: { x: 4, y: 0 } },
  ],
  props: PROPS,
  readouts: READOUTS,
};
