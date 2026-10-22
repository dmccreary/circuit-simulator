import type { ElementDescriptor } from "../api";

/** Default lead length from the terminal to the displayed value, grid units. */
export const READOUT_LENGTH = 2;

/**
 * Shows the voltage of the node it touches, like CircuitJS1's OutputElm ("O")
 * and AudioOutputElm. It draws no current.
 */
export const voltageReadoutDescriptor: ElementDescriptor = {
  type: "voltage-readout",
  category: "meters",
  aliases: ["output", "voltage readout", "node voltage", "voltage label", "audio output"],
  labelPrefix: "OUT",
  terminals: [{ name: "in", at: { x: 0, y: 0 } }],
  stretchable: { min: 1, default: READOUT_LENGTH, terminals: [] },
  props: [{ key: "showValue", unit: "", kind: "boolean", default: true }],
  readouts: [{ key: "voltage", unit: "V" }],
};
