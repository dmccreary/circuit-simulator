import type { ElementDescriptor } from "../api";

/** Terminal indexes, in CircuitJS1 TimerElm post order. */
export const T555 = { dis: 0, trig: 1, thres: 2, vcc: 3, ctl: 4, out: 5, rst: 6, gnd: 7 } as const;

/**
 * Behavioral 555 timer laid out like CircuitJS1's TimerElm (a 3×5 chip with
 * pins two units apart), shifted so the discharge pin is at the origin:
 * dis, trigger, threshold on the left; Vcc on top; control and ground below;
 * reset and output on the right.
 */
export const timer555Descriptor: ElementDescriptor = {
  type: "timer-555",
  category: "semiconductors",
  aliases: ["555", "555 timer", "timer", "ne555", "astable", "monostable"],
  labelPrefix: "U",
  terminals: [
    { name: "dis", at: { x: 0, y: 0 } },
    { name: "tr", at: { x: 0, y: 4 } },
    { name: "th", at: { x: 0, y: 6 } },
    { name: "Vcc", at: { x: 4, y: -4 } },
    { name: "ctl", at: { x: 4, y: 8 } },
    { name: "out", at: { x: 8, y: 2 } },
    { name: "rst", at: { x: 8, y: 0 } },
    { name: "gnd", at: { x: 6, y: 8 } },
  ],
  props: [],
  readouts: [
    { key: "output", unit: "" },
    { key: "vOut", unit: "V" },
    { key: "vCtl", unit: "V" },
  ],
};
