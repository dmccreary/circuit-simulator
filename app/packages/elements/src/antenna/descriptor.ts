import type { ElementDescriptor } from "../api";

/** Default lead length from the terminal to the antenna symbol, grid units. */
export const ANTENNA_LENGTH = 2;

/**
 * Antenna, as CircuitJS1's AntennaElm: a voltage on one terminal (referenced
 * to ground) that sums three AM stations (3000, 2710 and 2433 Hz carriers,
 * each modulated at 12-14 Hz) and one FM station (2200 Hz ± 100 Hz). Falstad
 * fixes these frequencies; `frequency` (the highest carrier, 3000 Hz by
 * default) scales them all.
 */
export const antennaDescriptor: ElementDescriptor = {
  type: "antenna",
  category: "sources",
  aliases: ["antenna", "aerial", "radio signal", "am radio"],
  labelPrefix: "ANT",
  terminals: [{ name: "+", at: { x: 0, y: 0 } }],
  stretchable: { min: 1, default: ANTENNA_LENGTH, terminals: [] },
  props: [{ key: "frequency", unit: "Hz", range: [1, 1e10], default: 3000 }],
  readouts: [
    { key: "voltage", unit: "V" },
    { key: "current", unit: "A" },
    { key: "power", unit: "W" },
  ],
  traits: { voltageSource: true },
};
