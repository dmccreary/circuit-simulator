import type { ElementDescriptor } from "../api";

/** Grid to plate/cathode column, grid units (CircuitJS1's usual 64 px). */
export const TRIODE_LENGTH = 4;

/**
 * Vacuum triode, as CircuitJS1's TriodeElm (Child-Langmuir law):
 *   Ip = (Vgk + Vpk/mu)^1.5 / kg1 while that sum is positive,
 * and a grid current Vgk/6000 Ω when the grid is positive. The grid is at the
 * origin; the plate two units up and the cathode two units down near the end.
 */
export const triodeDescriptor: ElementDescriptor = {
  type: "triode",
  category: "semiconductors",
  aliases: ["triode", "vacuum tube", "valve", "tube", "12ax7"],
  labelPrefix: "V",
  terminals: [
    { name: "G", at: { x: 0, y: 0 } },
    { name: "P", at: { x: TRIODE_LENGTH, y: -2 } },
    { name: "K", at: { x: TRIODE_LENGTH - 1, y: 2 } },
  ],
  stretchable: { min: 2, default: TRIODE_LENGTH, terminals: [1, 2] },
  props: [
    { key: "mu", unit: "", range: [1, 1e4], default: 93, showOnCanvas: true },
    { key: "kg1", unit: "", range: [1, 1e6], default: 680 },
  ],
  readouts: [
    { key: "ip", unit: "A" },
    { key: "ig", unit: "A" },
    { key: "vpk", unit: "V" },
    { key: "vgk", unit: "V" },
    { key: "power", unit: "W" },
  ],
};
