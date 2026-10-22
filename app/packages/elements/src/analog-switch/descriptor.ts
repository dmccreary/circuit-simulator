import type { ElementDescriptor, PropSpec } from "../api";

export const ANALOG_SWITCH_LENGTH = 4;

const props: PropSpec[] = [
  { key: "threshold", unit: "V", range: [-1e3, 1e3], default: 2.5 },
  { key: "onResistance", unit: "ohm", range: [1e-6, 1e9], default: 20 },
  { key: "offResistance", unit: "ohm", range: [1, 1e15], default: 1e10 },
  { key: "invert", unit: "", kind: "boolean", default: false },
  { key: "pulldown", unit: "", kind: "boolean", default: false },
];

/**
 * Voltage-controlled switch, as CircuitJS1's AnalogSwitchElm: closed while the
 * control terminal (midway along, one unit below the axis) is at or above
 * `threshold` (reversed by `invert`). With `pulldown` an open switch
 * disconnects and both sides are pulled to ground through offResistance.
 */
export const analogSwitchDescriptor: ElementDescriptor = {
  type: "analog-switch",
  category: "switches",
  aliases: ["analog switch", "voltage-controlled switch", "transmission gate", "cd4066", "bilateral switch"],
  labelPrefix: "S",
  terminals: [
    { name: "in", at: { x: 0, y: 0 } },
    { name: "out", at: { x: ANALOG_SWITCH_LENGTH, y: 0 } },
    { name: "ctl", at: { x: ANALOG_SWITCH_LENGTH / 2, y: 1 } },
  ],
  stretchable: { min: 2, default: ANALOG_SWITCH_LENGTH, terminals: [1], midTerminals: [2] },
  props,
  readouts: [
    { key: "closed", unit: "" },
    { key: "current", unit: "A" },
  ],
};

/**
 * Changeover version (AnalogSwitch2Elm): the common terminal joins throw A (one
 * unit above the axis) while the control (midway, one unit above) is high,
 * and throw B (one unit below) while it is low.
 */
export const analogSwitch2Descriptor: ElementDescriptor = {
  type: "analog-switch-2",
  category: "switches",
  aliases: ["analog spdt switch", "analog changeover switch", "analog multiplexer switch"],
  labelPrefix: "S",
  terminals: [
    { name: "C", at: { x: 0, y: 0 } },
    { name: "A", at: { x: ANALOG_SWITCH_LENGTH, y: -1 } },
    { name: "B", at: { x: ANALOG_SWITCH_LENGTH, y: 1 } },
    { name: "ctl", at: { x: ANALOG_SWITCH_LENGTH / 2, y: -1 } },
  ],
  stretchable: { min: 2, default: ANALOG_SWITCH_LENGTH, terminals: [1, 2], midTerminals: [3] },
  props,
  readouts: [
    { key: "closed", unit: "" },
    { key: "current", unit: "A" },
  ],
};
