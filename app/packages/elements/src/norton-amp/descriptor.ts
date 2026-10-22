import type { ElementDescriptor } from "../api";

export const NORTON_LENGTH = 6;

/**
 * Norton (current-differencing) amplifier, LM3900 style, after CircuitJS1's
 * NortonAmpElm: "+" at the origin, "-" two units below, output on the far
 * side midway. The "+" input current is mirrored and subtracted from the "-"
 * input; the output swings between 0 V and maxOutput.
 */
export const nortonAmpDescriptor: ElementDescriptor = {
  type: "norton-amp",
  category: "semiconductors",
  aliases: ["norton amplifier", "current differencing amplifier", "lm3900"],
  labelPrefix: "U",
  terminals: [
    { name: "+", at: { x: 0, y: 0 } },
    { name: "-", at: { x: 0, y: 2 } },
    { name: "out", at: { x: NORTON_LENGTH, y: 1 } },
  ],
  stretchable: { min: 2, default: NORTON_LENGTH, terminals: [2] },
  props: [
    { key: "gain", unit: "", range: [1, 1e9], default: 100000 },
    { key: "maxOutput", unit: "V", range: [0, 1e3], default: 12 },
  ],
  readouts: [
    { key: "vPlus", unit: "V" },
    { key: "vMinus", unit: "V" },
    { key: "vOut", unit: "V" },
    { key: "outputCurrent", unit: "A" },
  ],
};
