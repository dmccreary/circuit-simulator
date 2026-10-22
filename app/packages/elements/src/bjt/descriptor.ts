import type { ElementDescriptor, PropSpec, ReadoutSpec, TerminalSpec } from "../api";

/** Distance from the base terminal to the collector/emitter column, grid units (Falstad's usual 48 px). */
export const BJT_LENGTH = 3;

/**
 * Base at the origin; collector and emitter one unit either side of the axis
 * at x = BJT_LENGTH. NPN puts the collector on top, PNP the emitter, matching
 * CircuitJS1's TransistorElm so imported wiring lines up.
 */
function terminals(pnp: boolean): TerminalSpec[] {
  const s = pnp ? -1 : 1;
  return [
    { name: "B", at: { x: 0, y: 0 } },
    { name: "C", at: { x: BJT_LENGTH, y: -s } },
    { name: "E", at: { x: BJT_LENGTH, y: s } },
  ];
}

/** Imported at other Falstad sizes the collector and emitter move with the length (CircuitJS1 TransistorElm). */
const STRETCH_BJT = { min: 2, default: BJT_LENGTH, terminals: [1, 2] };

const props: PropSpec[] = [
  { key: "beta", unit: "", range: [1, 1e5], default: 100, sliderable: true, showOnCanvas: true },
  { key: "betaReverse", unit: "", range: [0.01, 1e3], default: 1 },
  { key: "saturationCurrent", unit: "A", range: [1e-20, 1e-6], default: 1e-14 },
];

/** region: 0 cut-off, 1 active, 2 saturation, 3 reverse active. */
const readouts: ReadoutSpec[] = [
  { key: "region", unit: "" },
  { key: "ic", unit: "A" },
  { key: "ib", unit: "A" },
  { key: "ie", unit: "A" },
  { key: "vbe", unit: "V" },
  { key: "vce", unit: "V" },
  { key: "vbc", unit: "V" },
  { key: "power", unit: "W" },
  { key: "gain", unit: "" },
];

export const npnDescriptor: ElementDescriptor = {
  type: "npn-transistor",
  category: "semiconductors",
  aliases: ["npn", "transistor", "bjt", "2n3904", "bipolar"],
  labelPrefix: "Q",
  terminals: terminals(false),
  stretchable: STRETCH_BJT,
  props,
  readouts,
};

export const pnpDescriptor: ElementDescriptor = {
  type: "pnp-transistor",
  category: "semiconductors",
  aliases: ["pnp", "transistor", "bjt", "2n3906", "bipolar"],
  labelPrefix: "Q",
  terminals: terminals(true),
  stretchable: STRETCH_BJT,
  props,
  readouts,
};
