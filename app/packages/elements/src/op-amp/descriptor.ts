import type { ElementDescriptor } from "../api";

/** Input-to-output distance, grid units: 144 px, the most common size in the Falstad examples. */
export const OPAMP_LENGTH = 9;

/**
 * Terminals follow CircuitJS1's OpAmpElm post order: inverting input at the
 * origin, non-inverting input two units below, output on the far side midway.
 * Flip the part to put "+" on top. The output is referenced to ground.
 */
export const opAmpDescriptor: ElementDescriptor = {
  type: "op-amp",
  category: "semiconductors",
  aliases: ["op-amp", "opamp", "operational amplifier", "amplifier", "lm741", "comparator"],
  labelPrefix: "U",
  terminals: [
    { name: "-", at: { x: 0, y: 0 } },
    { name: "+", at: { x: 0, y: 2 } },
    { name: "out", at: { x: OPAMP_LENGTH, y: 1 } },
  ],
  props: [
    { key: "gain", unit: "", range: [1, 1e9], default: 100000 },
    { key: "maxOutput", unit: "V", range: [-1e5, 1e5], default: 15 },
    { key: "minOutput", unit: "V", range: [-1e5, 1e5], default: -15 },
    { key: "outputResistance", unit: "ohm", range: [0, 1e6], default: 0 },
  ],
  readouts: [
    { key: "vPlus", unit: "V" },
    { key: "vMinus", unit: "V" },
    { key: "vOut", unit: "V" },
    { key: "outputCurrent", unit: "A" },
    { key: "saturated", unit: "" },
  ],
};
