import type { ElementDescriptor } from "../../api";
import { LEVEL_PROPS, TIMING_PROPS } from "../levels";

/** Rising-edge D flip-flop with active-high asynchronous set and reset (unconnected = inactive). */
export const dFlipFlopDescriptor: ElementDescriptor = {
  type: "d-flip-flop",
  category: "logic",
  aliases: ["d flip-flop", "d flip flop", "dff", "flip-flop", "register"],
  labelPrefix: "U",
  terminals: [
    { name: "D", at: { x: 0, y: 0 } },
    { name: "CLK", at: { x: 0, y: 2 } },
    { name: "Q", at: { x: 4, y: 0 } },
    { name: "Q̄", at: { x: 4, y: 2 } },
    { name: "S", at: { x: 2, y: -2 } },
    { name: "R", at: { x: 2, y: 4 } },
  ],
  // Imported Falstad chips are 6 units wide: Q and Q̄ move with the length (CircuitJS1 ChipElm).
  stretchable: { min: 3, default: 4, terminals: [2, 3] },
  props: [...TIMING_PROPS, ...LEVEL_PROPS, { key: "invertSetReset", unit: "", kind: "boolean", default: false }],
  readouts: [{ key: "q", unit: "" }],
};
