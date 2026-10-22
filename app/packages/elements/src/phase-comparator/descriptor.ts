import type { ElementDescriptor } from "../api";

/**
 * Phase-frequency comparator after CircuitJS1's PhaseCompElm (a 2×2 chip):
 * inputs I1 and I2 on the left, output O on the right. A rising edge on I1
 * drives O high, a rising edge on I2 drives it low, and once both have
 * risen the output floats (tri-state) until the next edge.
 */
export const phaseComparatorDescriptor: ElementDescriptor = {
  type: "phase-comparator",
  category: "logic",
  aliases: ["phase comparator", "phase detector", "phase frequency detector", "pll"],
  labelPrefix: "U",
  terminals: [
    { name: "I1", at: { x: 0, y: 0 } },
    { name: "I2", at: { x: 0, y: 2 } },
    { name: "O", at: { x: 6, y: 0 } },
  ],
  props: [{ key: "supply", unit: "V", range: [1, 1e3], default: 5 }],
  readouts: [{ key: "state", unit: "" }],
};
