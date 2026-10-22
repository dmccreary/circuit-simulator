import type { ElementDescriptor } from "../api";

/**
 * Voltage-controlled oscillator after CircuitJS1's VCOElm (a 2×4 chip, pins
 * two units apart): Vi and Vo on the left, the timing capacitor pins C1, C2
 * and the resistor pins R1, R2 on the right. R1 follows Vi and R2 sits at
 * 5 V; their resistor currents to ground, summed, charge the capacitor
 * between C1 and C2 one way and then the other, and Vo flips between 0 and
 * 5 V each time the capacitor voltage reaches 4.5 V or 0.5 V.
 */
export const vcoDescriptor: ElementDescriptor = {
  type: "vco",
  category: "sources",
  aliases: ["vco", "voltage-controlled oscillator", "4046"],
  labelPrefix: "U",
  terminals: [
    { name: "Vi", at: { x: 0, y: 0 } },
    { name: "Vo", at: { x: 0, y: 6 } },
    { name: "C1", at: { x: 6, y: 0 } },
    { name: "C2", at: { x: 6, y: 2 } },
    { name: "R1", at: { x: 6, y: 4 } },
    { name: "R2", at: { x: 6, y: 6 } },
  ],
  props: [],
  readouts: [
    { key: "vOut", unit: "V" },
    { key: "vCap", unit: "V" },
  ],
};
