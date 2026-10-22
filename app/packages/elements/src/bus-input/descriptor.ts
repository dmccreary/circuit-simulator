import type { ElementDescriptor, TerminalSpec } from "../api";
import { LEVEL_PROPS } from "../logic/levels";

/** Bus widths offered (CircuitJS1 BusLogicInputElm defaults to 4). */
export const BUS_INPUT_WIDTHS = [4, 8] as const;

/**
 * CircuitJS1 BusLogicInputElm: a multi-bit logic input showing its value.
 * Falstad puts every bit on one bus post (point1); ours has one terminal per
 * bit, bit z z units from the post along the body (local +x), value beyond.
 */
export const busTerminals = (width: number, name: string): TerminalSpec[] =>
  Array.from({ length: width }, (_, z) => ({ name: `${name}${z}`, at: { x: z, y: 0 } }));

export const busInputType = (w: number) => `bus-input-${w}`;

export const BUS_INPUT_DESCRIPTORS: ElementDescriptor[] = BUS_INPUT_WIDTHS.map((w) => ({
  type: busInputType(w),
  category: "logic",
  aliases: ["bus input", "bus logic input", "multi-bit input", `${w}-bit input`],
  labelPrefix: "IN",
  terminals: busTerminals(w, "D"),
  props: [{ key: "value", unit: "", range: [0, 2 ** w - 1], default: 0 }, ...LEVEL_PROPS],
  readouts: [],
}));
