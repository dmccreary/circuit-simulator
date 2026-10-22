import type { ElementDescriptor, PropSpec, ReadoutSpec, TerminalSpec } from "../api";

/** Distance from the gate terminal to the drain/source column, grid units (Falstad's usual 48 px). */
export const MOSFET_LENGTH = 3;

/** Gate at the origin, drain above and source below the axis, as in CircuitJS1's MosfetElm. */
const terminals: TerminalSpec[] = [
  { name: "G", at: { x: 0, y: 0 } },
  { name: "D", at: { x: MOSFET_LENGTH, y: -1 } },
  { name: "S", at: { x: MOSFET_LENGTH, y: 1 } },
];

/**
 * `threshold` and `beta` are in the device's own polarity: a P-channel part
 * with threshold 1.5 turns on when Vsg exceeds 1.5 V. Negative thresholds
 * give depletion-mode parts. Saturation current is beta/2·(Vgs - Vt)².
 */
/** Imported at other Falstad sizes the drain and source move with the length (CircuitJS1 MosfetElm). */
const STRETCH_MOSFET = { min: 2, default: MOSFET_LENGTH, terminals: [1, 2] };

const props: PropSpec[] = [
  { key: "threshold", unit: "V", range: [-100, 100], default: 1.5, showOnCanvas: true },
  { key: "beta", unit: "", range: [1e-9, 100], default: 0.02 },
  { key: "lambda", unit: "", range: [0, 1], default: 0 },
];

/** region: 0 cut-off, 1 linear (triode), 2 saturation. */
const readouts: ReadoutSpec[] = [
  { key: "region", unit: "" },
  { key: "id", unit: "A" },
  { key: "vgs", unit: "V" },
  { key: "vds", unit: "V" },
  { key: "gm", unit: "" },
  { key: "power", unit: "W" },
];

export const nMosfetDescriptor: ElementDescriptor = {
  type: "n-mosfet",
  category: "semiconductors",
  aliases: ["nmos", "n-channel mosfet", "mosfet", "fet", "2n7000"],
  labelPrefix: "M",
  terminals,
  stretchable: STRETCH_MOSFET,
  props,
  readouts,
};

export const pMosfetDescriptor: ElementDescriptor = {
  type: "p-mosfet",
  category: "semiconductors",
  aliases: ["pmos", "p-channel mosfet", "mosfet", "fet"],
  labelPrefix: "M",
  terminals,
  stretchable: STRETCH_MOSFET,
  props,
  readouts,
};
