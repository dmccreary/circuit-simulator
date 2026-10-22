import type { ElementDescriptor } from "../api";

/** Emitter to base column, grid units (CircuitJS1's usual 80 px). */
export const UJT_LENGTH = 5;

/**
 * Unijunction transistor, as CircuitJS1's UnijunctionElm (a 2N2646 composite
 * model). Emitter at the origin, B2 at the end of the axis, B1 two units
 * below it.
 */
export const unijunctionDescriptor: ElementDescriptor = {
  type: "unijunction",
  category: "semiconductors",
  aliases: ["ujt", "unijunction transistor", "unijunction", "2n2646"],
  labelPrefix: "Q",
  terminals: [
    { name: "E", at: { x: 0, y: 0 } },
    { name: "B1", at: { x: UJT_LENGTH, y: 2 } },
    { name: "B2", at: { x: UJT_LENGTH, y: 0 } },
  ],
  stretchable: { min: 2, default: UJT_LENGTH, terminals: [1, 2] },
  props: [],
  readouts: [
    { key: "ie", unit: "A" },
    { key: "ib1", unit: "A" },
    { key: "ib2", unit: "A" },
    { key: "veb1", unit: "V" },
    { key: "power", unit: "W" },
  ],
};
