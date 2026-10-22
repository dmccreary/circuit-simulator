import type { ElementDescriptor } from "../api";

export const TLINE_LENGTH = 8;
/** Distance between the signal and return conductors, grid units (CircuitJS1's default 64 px). */
export const TLINE_WIDTH = 4;

/**
 * Lossless transmission line, as CircuitJS1's TransLineElm: signal conductor
 * from A+ (origin) to B+ (far end), return conductor TLINE_WIDTH below.
 * A wave entering one end leaves the other `delay` seconds later.
 */
export const transmissionLineDescriptor: ElementDescriptor = {
  type: "transmission-line",
  category: "passive",
  aliases: ["transmission line", "coax", "coaxial cable", "delay line", "tline"],
  labelPrefix: "TL",
  terminals: [
    { name: "A+", at: { x: 0, y: 0 } },
    { name: "B+", at: { x: TLINE_LENGTH, y: 0 } },
    { name: "A-", at: { x: 0, y: TLINE_WIDTH } },
    { name: "B-", at: { x: TLINE_LENGTH, y: TLINE_WIDTH } },
  ],
  stretchable: { min: 2, default: TLINE_LENGTH, terminals: [1, 3] },
  props: [
    { key: "delay", unit: "s", range: [1e-15, 1], default: 1e-8 },
    { key: "impedance", unit: "ohm", range: [1e-3, 1e6], default: 75 },
  ],
  readouts: [
    { key: "voltageA", unit: "V" },
    { key: "voltageB", unit: "V" },
    { key: "currentA", unit: "A" },
    { key: "currentB", unit: "A" },
  ],
};
