import type { ElementDescriptor } from "../api";
import { STRETCH, twoTerminals } from "../shared/descriptorKit";

/** Reads V(+) - V(-). inputResistance 0 means infinite. */
export const voltmeterDescriptor: ElementDescriptor = {
  type: "voltmeter",
  category: "meters",
  essentials: true,
  aliases: ["voltmeter", "volt meter", "volts"],
  hotkey: "v",
  labelPrefix: "VM",
  terminals: twoTerminals("+", "-"),
  stretchable: STRETCH,
  props: [{ key: "inputResistance", unit: "ohm", range: [0, 1e15], default: 0, realisticDefault: 10e6 }],
  readouts: [
    { key: "voltage", unit: "V" },
    { key: "current", unit: "A" },
  ],
  traits: { voltmeter: true },
};
