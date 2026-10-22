import type { ElementDescriptor } from "../../api";
import { LEVEL_PROPS, TIMING_PROPS } from "../levels";
import { GATE_LENGTH, WIDE_GATE_INPUTS, gateLayout } from "./geometry";

const PROPS = [...TIMING_PROPS, ...LEVEL_PROPS];
const READOUTS = [
  { key: "output", unit: "" as const },
  { key: "voltage", unit: "V" as const },
];

function gate(type: string, aliases: string[], n = 2): ElementDescriptor {
  const { inputs, axis } = gateLayout(n);
  return {
    type: n === 2 ? type : `${type}-${n}`,
    category: "logic",
    aliases: n === 2 ? aliases : aliases.map((a) => `${n}-input ${a}`),
    labelPrefix: "U",
    terminals: [
      ...inputs.map((y, i) => ({ name: String.fromCharCode(65 + i), at: { x: 0, y } })),
      { name: "Y", at: { x: GATE_LENGTH, y: axis } },
    ],
    // Imported at other Falstad sizes the output moves with the length (CircuitJS1 GateElm).
    stretchable: { min: 2, default: GATE_LENGTH, terminals: [n] },
    props: PROPS,
    readouts: READOUTS,
  };
}

export const andGateDescriptor = gate("and-gate", ["and", "and gate"]);
export const orGateDescriptor = gate("or-gate", ["or", "or gate"]);
export const nandGateDescriptor = gate("nand-gate", ["nand", "nand gate"]);
export const norGateDescriptor = gate("nor-gate", ["nor", "nor gate"]);
export const xorGateDescriptor = gate("xor-gate", ["xor", "xor gate", "exclusive or"]);

/** Gates with more than two inputs, as separate types ("and-gate-3"). */
export const WIDE_GATE_DESCRIPTORS: ElementDescriptor[] = WIDE_GATE_INPUTS.flatMap((n) => [
  gate("and-gate", ["and", "and gate"], n),
  gate("or-gate", ["or", "or gate"], n),
  gate("nand-gate", ["nand", "nand gate"], n),
  gate("nor-gate", ["nor", "nor gate"], n),
  gate("xor-gate", ["xor", "xor gate", "exclusive or"], n),
]);

export const notGateDescriptor: ElementDescriptor = {
  type: "not-gate",
  category: "logic",
  aliases: ["not", "inverter", "not gate"],
  labelPrefix: "U",
  terminals: [
    { name: "A", at: { x: 0, y: 0 } },
    { name: "Y", at: { x: GATE_LENGTH, y: 0 } },
  ],
  // Imported at other Falstad sizes the output moves with the length (CircuitJS1 InverterElm).
  stretchable: { min: 2, default: GATE_LENGTH, terminals: [1] },
  props: PROPS,
  readouts: READOUTS,
};
