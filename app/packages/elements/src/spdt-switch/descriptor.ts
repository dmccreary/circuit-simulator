import type { ElementDescriptor } from "../api";
import { bool, type Props } from "../shared/props";

export const SPDT_LENGTH = 4;

/**
 * Single-pole double-throw switch, as CircuitJS1's Switch2Elm ("S"): the
 * common terminal at the origin, throw A one unit above the axis and throw B
 * one unit below at the far end. `thrown` false connects A, true connects B.
 */
export const spdtSwitchDescriptor: ElementDescriptor = {
  type: "spdt-switch",
  category: "switches",
  aliases: ["spdt", "changeover switch", "two-way switch", "selector switch", "double throw"],
  labelPrefix: "S",
  terminals: [
    { name: "C", at: { x: 0, y: 0 } },
    { name: "A", at: { x: SPDT_LENGTH, y: -1 } },
    { name: "B", at: { x: SPDT_LENGTH, y: 1 } },
  ],
  stretchable: { min: 2, default: SPDT_LENGTH, terminals: [1, 2] },
  props: [
    { key: "thrown", unit: "", kind: "boolean", default: false },
    { key: "momentary", unit: "", kind: "boolean", default: false },
  ],
  readouts: [
    { key: "position", unit: "" },
    { key: "current", unit: "A" },
  ],
  traits: { toggleProp: "thrown" },
};

/** Terminal joined to the common terminal for these props (1 = A, 2 = B). */
export const spdtSelected = (props: Props): 1 | 2 => (bool(props, "thrown", false) ? 2 : 1);
