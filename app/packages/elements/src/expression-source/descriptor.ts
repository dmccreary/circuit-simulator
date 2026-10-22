import type { ElementDescriptor, TerminalSpec } from "../api";

export const EXPR_MAX_INPUTS = 8;
export const EXPR_KINDS = ["vcvs", "vccs", "ccvs", "cccs"] as const;
export type ExprKind = (typeof EXPR_KINDS)[number];

/**
 * A source whose output is a formula of its inputs, as CircuitJS1's VCVSElm,
 * VCCSElm, CCVSElm, and CCCSElm (ChipElm 2 wide): inputs down the left two
 * units apart, output "+" and "-" on the right. Voltage-controlled kinds read
 * each input against ground as a..h; current-controlled kinds pair the inputs
 * (a+ a-, b+ b- ...) and read the current through each pair. Only the first
 * `inputs` pins are used. See expr.ts for the formula language.
 */
const terminals: TerminalSpec[] = [
  ...Array.from({ length: EXPR_MAX_INPUTS }, (_, i) => ({ name: String.fromCharCode(65 + i), at: { x: 0, y: 2 * i } })),
  { name: "+", at: { x: 6, y: 0 } },
  { name: "-", at: { x: 6, y: 2 } },
];

export const expressionSourceDescriptor: ElementDescriptor = {
  type: "expression-source",
  category: "sources",
  aliases: ["expression source", "behavioral source", "custom source", "vcvs", "vccs", "ccvs", "cccs", "formula", "function"],
  labelPrefix: "B",
  terminals,
  props: [
    { key: "kind", unit: "", kind: "enum", options: [...EXPR_KINDS], default: "vcvs" },
    { key: "inputs", unit: "", range: [0, EXPR_MAX_INPUTS], default: 2 },
    { key: "expression", unit: "", kind: "text", default: "(a-b)*10" },
  ],
  readouts: [{ key: "output", unit: "" }],
};

/** Output terminals (after the inputs). */
export const OUT_PLUS = EXPR_MAX_INPUTS;
export const OUT_MINUS = EXPR_MAX_INPUTS + 1;
