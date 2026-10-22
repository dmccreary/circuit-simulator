import type { ElementDescriptor } from "../api";

export const POT_WIPER = { x: 2, y: -2 } as const;

/** Terminals: end A, end B, wiper. `position` 0 puts the wiper at end A. */
export const potentiometerDescriptor: ElementDescriptor = {
  type: "potentiometer",
  category: "passive",
  essentials: true,
  aliases: ["potentiometer", "pot", "variable resistor", "rheostat", "trimmer"],
  hotkey: "p",
  labelPrefix: "R",
  terminals: [
    { name: "A", at: { x: 0, y: 0 } },
    { name: "B", at: { x: 4, y: 0 } },
    { name: "W", at: POT_WIPER },
  ],
  // Imported at other Falstad lengths: B moves with the length, the wiper stays midway.
  stretchable: { min: 2, default: 4, terminals: [1], midTerminals: [2] },
  props: [
    { key: "resistance", unit: "ohm", range: [1e-3, 1e12], default: 10000, standardSeries: true, showOnCanvas: true },
    { key: "position", unit: "", range: [0, 1], default: 0.5, sliderable: true },
    { key: "taper", unit: "", kind: "enum", options: ["linear", "log"], default: "linear" },
  ],
  readouts: [
    { key: "resistanceA", unit: "ohm" },
    { key: "resistanceB", unit: "ohm" },
    { key: "wiperVoltage", unit: "V" },
    { key: "currentA", unit: "A" },
    { key: "currentB", unit: "A" },
    { key: "currentWiper", unit: "A" },
  ],
};
