import type { ElementDescriptor } from "../api";
import { STRETCH, twoTerminals, VIP } from "../shared/descriptorKit";

/**
 * HP-style linear-drift memristor, as CircuitJS1's MemristorElm: a doped
 * region of width w (0..totalWidth) moves with the charge through it, and
 * R = onResistance·w/D + offResistance·(1 - w/D). Current into terminal 1
 * widens the doped region.
 */
export const memristorDescriptor: ElementDescriptor = {
  type: "memristor",
  category: "passive",
  aliases: ["memristor", "memory resistor"],
  labelPrefix: "M",
  terminals: twoTerminals(),
  stretchable: STRETCH,
  props: [
    { key: "onResistance", unit: "ohm", range: [1e-3, 1e9], default: 100 },
    { key: "offResistance", unit: "ohm", range: [1e-3, 1e12], default: 16000 },
    { key: "totalWidth", unit: "", range: [1e-12, 1], default: 1e-8 },
    { key: "mobility", unit: "", range: [1e-20, 1], default: 1e-10 },
    { key: "initialWidth", unit: "", range: [0, 1], default: 0 },
  ],
  readouts: [...VIP, { key: "resistance", unit: "ohm" }],
};
