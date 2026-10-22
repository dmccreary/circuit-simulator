import type { ElementDescriptor } from "../api";

export const GYRATOR_LENGTH = 6;

/**
 * Two-port gyrator after CircuitJS1's GyratorElm: port 1 from "1+" (origin)
 * to "1-" two units below, port 2 from "2+" to "2-" on the far side.
 *   I1 = V2 / R,  I2 = -V1 / R   (currents into the "+" terminals)
 * so a capacitor C on port 2 looks like an inductor L = R²·C on port 1.
 */
export const gyratorDescriptor: ElementDescriptor = {
  type: "gyrator",
  category: "passive",
  aliases: ["gyrator", "impedance inverter", "two-port"],
  labelPrefix: "G",
  terminals: [
    { name: "1+", at: { x: 0, y: 0 } },
    { name: "2+", at: { x: GYRATOR_LENGTH, y: 0 } },
    { name: "1-", at: { x: 0, y: 2 } },
    { name: "2-", at: { x: GYRATOR_LENGTH, y: 2 } },
  ],
  stretchable: { min: 2, default: GYRATOR_LENGTH, terminals: [1, 3] },
  props: [{ key: "resistance", unit: "ohm", range: [1e-3, 1e9], default: 1000, showOnCanvas: true }],
  readouts: [
    { key: "v1", unit: "V" },
    { key: "v2", unit: "V" },
    { key: "i1", unit: "A" },
    { key: "i2", unit: "A" },
  ],
};
