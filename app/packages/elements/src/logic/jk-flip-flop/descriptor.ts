import type { ElementDescriptor } from "../../api";
import { LEVEL_PROPS, TIMING_PROPS } from "../levels";

/** Rising-edge JK flip-flop: 00 hold, 10 set, 01 reset, 11 toggle. */
export const jkFlipFlopDescriptor: ElementDescriptor = {
  type: "jk-flip-flop",
  category: "logic",
  aliases: ["jk flip-flop", "jk flip flop", "jk", "jkff"],
  labelPrefix: "U",
  terminals: [
    { name: "J", at: { x: 0, y: 0 } },
    { name: "CLK", at: { x: 0, y: 2 } },
    { name: "K", at: { x: 0, y: 4 } },
    { name: "Q", at: { x: 4, y: 0 } },
    { name: "Q̄", at: { x: 4, y: 4 } },
  ],
  // Imported Falstad chips are 6 units wide: Q and Q̄ move with the length (CircuitJS1 ChipElm).
  stretchable: { min: 3, default: 4, terminals: [3, 4] },
  props: [...TIMING_PROPS, ...LEVEL_PROPS],
  readouts: [{ key: "q", unit: "" }],
};
