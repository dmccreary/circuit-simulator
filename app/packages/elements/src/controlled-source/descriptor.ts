import type { ElementDescriptor, ReadoutSpec, TerminalSpec, Unit } from "../api";

/** Width between the control pair (left) and the output pair (right), grid units. */
export const CS_WIDTH = 4;
export const CS_HEIGHT = 2;

/** Control pair on the left (C+ above C-), output pair on the right (O+ above O-). */
const terminals: TerminalSpec[] = [
  { name: "C+", at: { x: 0, y: 0 } },
  { name: "C-", at: { x: 0, y: CS_HEIGHT } },
  { name: "O+", at: { x: CS_WIDTH, y: 0 } },
  { name: "O-", at: { x: CS_WIDTH, y: CS_HEIGHT } },
];

/** control: the controlling voltage (V) or current (A). */
const readouts: ReadoutSpec[] = [
  { key: "voltage", unit: "V" },
  { key: "current", unit: "A" },
  { key: "power", unit: "W" },
  { key: "control", unit: "" },
];

/** SPICE letters: E (VCVS), G (VCCS), H (CCVS), F (CCCS). */
function controlled(type: string, prefix: string, aliases: string[], gainUnit: Unit, gain: number): ElementDescriptor {
  return {
    type,
    category: "sources",
    aliases,
    labelPrefix: prefix,
    terminals,
    props: [{ key: "gain", unit: gainUnit, range: [-1e9, 1e9], default: gain, sliderable: true, showOnCanvas: true }],
    readouts,
  };
}

/** V(O+,O-) = gain·V(C+,C-). */
export const vcvsDescriptor = controlled("vcvs", "E", ["vcvs", "voltage-controlled voltage source", "dependent source"], "", 2);
/** Current gain·V(C+,C-) flows into O+, through the source, out of O- (SPICE G). Gain in siemens. */
export const vccsDescriptor = controlled("vccs", "G", ["vccs", "voltage-controlled current source", "transconductance"], "", 0.1);
/** V(O+,O-) = gain·I(C), I(C) flowing into C+ through the zero-volt control port. Gain in ohms. */
export const ccvsDescriptor = controlled("ccvs", "H", ["ccvs", "current-controlled voltage source", "transresistance"], "ohm", 1000);
/** Current gain·I(C) flows into O+, through the source, out of O- (SPICE F). */
export const cccsDescriptor = controlled("cccs", "F", ["cccs", "current-controlled current source", "current mirror"], "", 2);
