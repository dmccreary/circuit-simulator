import type { ElementDescriptor } from "../api";
import { STRETCH, twoTerminals } from "../shared/descriptorKit";

/** Reads the current flowing in at "+" and out at "-". */
export const ammeterDescriptor: ElementDescriptor = {
  type: "ammeter",
  category: "meters",
  essentials: true,
  aliases: ["ammeter", "current meter", "amps"],
  labelPrefix: "A",
  terminals: twoTerminals("+", "-"),
  stretchable: STRETCH,
  props: [{ key: "burdenResistance", unit: "ohm", range: [0, 1e6], default: 0, realisticDefault: 0.1 }],
  readouts: [
    { key: "current", unit: "A" },
    { key: "voltage", unit: "V" },
  ],
  traits: { ammeter: true },
};
